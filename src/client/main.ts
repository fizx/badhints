import { navigateTo } from "@devvit/client";
import { getPuzzleManager, GameState } from "./puzzle";
import { cosineDistance } from "./puzzle";
import pako from "pako";

const guessInput = document.getElementById("guess-input") as HTMLInputElement;
const guessButton = document.getElementById(
  "guess-button"
) as HTMLButtonElement;
const messageArea = document.getElementById("message-area") as HTMLDivElement;
const guessesRemainingElement = document.getElementById(
  "guesses-remaining"
) as HTMLDivElement;
const loader = document.getElementById("loader") as HTMLDivElement;
const gameContainer = document.getElementById(
  "game-container"
) as HTMLDivElement;

const docsLink = document.getElementById("docs-link") as HTMLDivElement;
const playtestLink = document.getElementById("playtest-link") as HTMLDivElement;
const discordLink = document.getElementById("discord-link") as HTMLDivElement;

docsLink.addEventListener("click", () =>
  navigateTo("https://developers.reddit.com/docs")
);
playtestLink.addEventListener("click", () =>
  navigateTo("https://www.reddit.com/r/Devvit")
);
discordLink.addEventListener("click", () =>
  navigateTo("https://discord.com/invite/R7yu2wh9Qz")
);

let gameState: GameState | null = null;
let puzzleManager: ReturnType<typeof getPuzzleManager> | null = null;

async function initializeGame() {
  try {
    // First, fetch the puzzle's vector data from the client assets.
    const puzzleDataResponse = await fetch("/puzzle_data.json.gz");
    if (!puzzleDataResponse.ok) {
      throw new Error("Failed to fetch puzzle data.");
    }
    const compressed = await puzzleDataResponse.arrayBuffer();
    const decompressed = pako.inflate(compressed, { to: "string" });
    const puzzleData = JSON.parse(decompressed);

    // Initialize the puzzle manager with the vector data.
    puzzleManager = getPuzzleManager({
      hint_vocabulary: puzzleData.hint_vocabulary,
      hint_embeddings: puzzleData.hint_embeddings,
    });

    // Then, fetch the daily target word and player's saved state from the server.
    const serverStateResponse = await fetch("/api/puzzle/state");
    if (!serverStateResponse.ok) {
      throw new Error("Failed to fetch puzzle state from server.");
    }
    const { targetWord, playerState } = await serverStateResponse.json();
    const targetEmbedding = puzzleManager.getEmbedding(targetWord);

    if (!targetEmbedding) {
      throw new Error("Target word from server not found in embeddings.");
    }

    // Combine the server state with the local embedding to form the complete game state.
    gameState = {
      ...playerState,
      targetWord,
      targetEmbedding,
    };

    if (gameState) {
      console.log("Game initialized. Target word:", gameState.targetWord);
      updateUI();
    }
  } catch (error) {
    console.error("Failed to initialize game:", error);
    messageArea.textContent = "Failed to load puzzle data. Please refresh.";
    messageArea.className = "message error";
  } finally {
    loader.style.display = "none";
    gameContainer.style.display = "block";
  }
}

function updateUI() {
  if (!gameState) return;

  const remainingGuesses = 10 - gameState.guessesHistory.length;

  if (gameState.solved) {
    messageArea.textContent = `You already solved this! The word was "${gameState.targetWord}".`;
    messageArea.className = "message success";
    guessesRemainingElement.textContent = "";
    guessInput.disabled = true;
    guessButton.disabled = true;
  } else if (remainingGuesses <= 0) {
    messageArea.textContent = `You are out of guesses. The word was "${gameState.targetWord}".`;
    messageArea.className = "message error";
    guessesRemainingElement.textContent = "";
    guessInput.disabled = true;
    guessButton.disabled = true;
  } else {
    messageArea.textContent = "Guess a word to start or continue the puzzle!";
    guessesRemainingElement.textContent = `You have ${remainingGuesses} guesses.`;
  }
}

async function saveGameState() {
  if (!gameState) {
    return;
  }
  try {
    await fetch("/api/puzzle/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guessesHistory: gameState.guessesHistory,
        usedHints: gameState.usedHints,
        solved: gameState.solved,
      }),
    });
  } catch (error) {
    console.error("Failed to save game state:", error);
    // Optionally, handle this with a message to the user.
  }
}

async function handleGuess() {
  if (!gameState || !puzzleManager) {
    messageArea.textContent = "Game is not initialized.";
    return;
  }
  const guess = guessInput.value.trim().toLowerCase();
  if (!guess) {
    return;
  }

  if (gameState.guessesHistory.includes(guess)) {
    messageArea.textContent = "You have already guessed this word.";
    messageArea.className = "message hint";
    guessInput.value = "";
    return;
  }

  guessButton.disabled = true;
  guessInput.disabled = true;

  try {
    const guessEmbedding = puzzleManager.getEmbedding(guess);

    if (!guessEmbedding) {
      messageArea.textContent = "I don't know that word.";
      messageArea.className = "message error";
      return;
    }

    if (guess === gameState.targetWord) {
      gameState.solved = true;
      messageArea.textContent = `You got it! The word was "${gameState.targetWord}".`;
      messageArea.className = "message success";
      guessesRemainingElement.textContent = "";
      saveGameState(); // Save the final state.
      return;
    }

    gameState.guessesHistory.push(guess);
    const remainingGuesses = 10 - gameState.guessesHistory.length;

    if (remainingGuesses <= 0) {
      messageArea.textContent = `You are out of guesses. The word was "${gameState.targetWord}".`;
      messageArea.className = "message error";
      guessesRemainingElement.textContent = "";
      saveGameState(); // Save the final state.
      return;
    }

    const hint = puzzleManager.findHint(guess, gameState);
    gameState.usedHints.push(hint);

    const distance = cosineDistance(guessEmbedding, gameState.targetEmbedding);

    messageArea.textContent = `"${guess}" is ${distance.toFixed(
      3
    )} away. Hint: ${hint}`;
    messageArea.className = "message hint";
    guessesRemainingElement.textContent = `Guesses remaining: ${remainingGuesses}`;
    saveGameState(); // Save state after each guess.
  } catch (error) {
    messageArea.textContent = "An unexpected error occurred.";
    messageArea.className = "message error";
  } finally {
    guessInput.value = "";
    if (!gameState.solved) {
      guessButton.disabled = false;
      guessInput.disabled = false;
      guessInput.focus();
    }
  }
}

guessButton.addEventListener("click", handleGuess);
guessInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    handleGuess();
  }
});

initializeGame();
