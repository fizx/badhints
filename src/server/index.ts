import express from "express";

import { createServer, context, getServerPort } from "@devvit/server";
import { redis } from "@devvit/redis";
import { reddit } from "@devvit/reddit";
import { getPuzzleManager, GameState } from "./puzzle";

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

const puzzleManager = getPuzzleManager();

router.post("/internal/puzzle/create", async (req, res) => {
  await reddit.submitPost({
    title: "Bad Hints #1",
    subredditName: context.subredditName ?? "badhints2_dev",
    preview: "",
  });
  res.json({ message: "Puzzle created" });
});

router.post("/api/puzzle/hint", async (req, res) => {
  const { postId, userId } = context;
  if (!postId) {
    return res.status(400).json({ error: "postId is required" });
  }

  const { guess } = req.body;
  if (!guess || typeof guess !== "string") {
    return res.status(400).json({ error: "Guess must be a non-empty string." });
  }

  const vocabulary = puzzleManager.getVocabulary();
  if (!vocabulary.includes(guess)) {
    return res.status(400).json({ error: "Word not in vocabulary." });
  }

  // LAZY INITIALIZATION
  // Try to get the target word. If it doesn't exist, create it.
  let targetStateString = await redis.get(`puzzle:target:${postId}`);
  if (!targetStateString) {
    const wordIndex = await redis.incrBy("puzzle:globalWordIndex", 1);
    const shuffledVocab = puzzleManager.getShuffledVocabulary();
    const targetWord = shuffledVocab[wordIndex % shuffledVocab.length];

    if (!targetWord) {
      return res.status(500).json({ error: "Could not select a target word." });
    }

    const targetEmbedding = puzzleManager.getEmbedding(targetWord);
    if (!targetEmbedding) {
      return res
        .status(500)
        .json({ error: "Could not find embedding for target word." });
    }

    const newTargetState = { targetWord, targetEmbedding };
    await redis.set(`puzzle:target:${postId}`, JSON.stringify(newTargetState));
    targetStateString = JSON.stringify(newTargetState);
  }

  // Try to get the player state. If it doesn't exist, create it.
  let playerStateString = await redis.get(`puzzle:player:${postId}:${userId}`);
  if (!playerStateString) {
    const newPlayerState = { guessesHistory: [], usedHints: [] };
    await redis.set(
      `puzzle:player:${postId}:${userId}`,
      JSON.stringify(newPlayerState)
    );
    playerStateString = JSON.stringify(newPlayerState);
  }

  const targetState: { targetWord: string; targetEmbedding: number[] } =
    JSON.parse(targetStateString);
  const playerState: {
    guessesHistory: string[];
    usedHints: string[];
    solved?: boolean;
  } = JSON.parse(playerStateString);

  // Check if this player has already completed the puzzle.
  if (playerState.solved) {
    return res.json({
      isGameOver: true,
      message: `You have already completed this puzzle! The word was '${targetState.targetWord}'.`,
    });
  }

  // Add the current guess to history
  playerState.guessesHistory.push(guess);

  // Check for a win
  if (guess === targetState.targetWord) {
    playerState.solved = true;
    await redis.set(
      `puzzle:player:${postId}:${userId}`,
      JSON.stringify(playerState)
    );
    return res.json({
      correct: true,
      isGameOver: true,
      message: `Congratulations! You guessed the word in ${playerState.guessesHistory.length} tries!`,
    });
  }

  // Check for a loss (out of guesses)
  if (playerState.guessesHistory.length >= 10) {
    playerState.solved = true; // Mark as solved to end the game.
    await redis.set(
      `puzzle:player:${postId}:${userId}`,
      JSON.stringify(playerState)
    );
    return res.json({
      correct: false,
      isGameOver: true,
      message: `You've used all 10 guesses! The word was '${targetState.targetWord}'.`,
    });
  }

  const gameState: GameState = {
    ...targetState,
    ...playerState,
  };

  const hint = puzzleManager.findHint(guess, gameState);
  playerState.usedHints.push(hint);
  await redis.set(
    `puzzle:player:${postId}:${userId}`,
    JSON.stringify(playerState)
  );

  res.json({
    correct: false,
    isGameOver: false,
    hint,
    guessesRemaining: 10 - playerState.guessesHistory.length,
  });
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
