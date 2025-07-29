import { Devvit } from "@devvit/public-api";
import express from "express";

import { createServer, context, getServerPort } from "@devvit/server";
import { redis } from "@devvit/redis";
import { reddit } from "@devvit/reddit";
import type { UiResponse } from "@devvit/web/shared";

import words from "./words.json";

const app = express();

// Middleware for JSON body parsing
app.use(express.json());

const router = express.Router();

// This endpoint is used for a one-time setup to create the puzzle post.
router.post("/internal/puzzle/create", async (req, res) => {
  if (!context.subredditName) {
    return res.status(400).json({ error: "Subreddit context is required." });
  }
  try {
    const post = await reddit.submitPost({
      title: "Bad Hints Puzzle",
      subredditName: context.subredditName,
      splash: {
        appDisplayName: "Bad Hints Puzzle",
        title: "Bad Hints Puzzle",
        description: "A puzzle game where you have to guess the word.",
        buttonLabel: "Play",
      },
    });
    res.json({
      navigateTo: {
        url: `https://www.reddit.com${post.permalink}`,
      },
    } as UiResponse);
  } catch (error) {
    console.error("Failed to create post:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.json({
      showToast: { text: `Error creating post: ${errorMessage}` },
    } as UiResponse);
  }
});

router.get("/api/puzzle/state", async (req, res) => {
  const { postId, userId } = context;
  if (!postId) {
    return res.status(400).json({ error: "Post context is required." });
  }

  try {
    // Determine the target word based on the post's creation date.
    const post = await reddit.getPostById(postId);
    const creationDate = new Date(post.createdAt);
    const dayOfYear = Math.floor(
      (creationDate.getTime() -
        new Date(creationDate.getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const targetWord = words[dayOfYear % words.length]!;

    // Fetch the player's state from Redis.
    const playerStateString = await redis.get(
      `puzzle:player:${postId}:${userId}`
    );
    let playerState;
    if (playerStateString) {
      playerState = JSON.parse(playerStateString);
    } else {
      // Default state for a new player.
      playerState = { guessesHistory: [], usedHints: [], solved: false };
    }

    res.json({ targetWord, playerState });
  } catch (error) {
    console.error("Failed to get puzzle state:", error);
    res.status(500).json({ error: "Failed to retrieve puzzle state." });
  }
});

router.post("/api/puzzle/save", async (req, res) => {
  const { postId, userId } = context;
  if (!postId) {
    return res.status(400).json({ error: "Post context is required." });
  }

  const { guessesHistory, usedHints, solved } = req.body;
  if (
    !Array.isArray(guessesHistory) ||
    !Array.isArray(usedHints) ||
    typeof solved !== "boolean"
  ) {
    return res.status(400).json({ error: "Invalid player state provided." });
  }

  try {
    const playerState = { guessesHistory, usedHints, solved };
    await redis.set(
      `puzzle:player:${postId}:${userId}`,
      JSON.stringify(playerState)
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to save puzzle state:", error);
    res.status(500).json({ error: "Failed to save puzzle state." });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
