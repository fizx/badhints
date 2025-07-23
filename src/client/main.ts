import { navigateTo } from "@devvit/client";

const guessInput = document.getElementById("guess-input") as HTMLInputElement;
const guessButton = document.getElementById(
  "guess-button"
) as HTMLButtonElement;
const messageArea = document.getElementById("message-area") as HTMLDivElement;
const guessesRemainingElement = document.getElementById(
  "guesses-remaining"
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

async function handleGuess() {
  const guess = guessInput.value.trim().toLowerCase();
  if (!guess) {
    return;
  }

  guessButton.disabled = true;
  guessInput.disabled = true;

  try {
    const response = await fetch("/api/puzzle/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess }),
    });

    const data = await response.json();

    if (!response.ok) {
      messageArea.textContent = data.error || "An unknown error occurred.";
      messageArea.className = "message error";
      return;
    }

    if (data.isGameOver) {
      messageArea.textContent = data.message;
      guessesRemainingElement.textContent = "";
      if (data.correct) {
        messageArea.className = "message success";
      } else {
        messageArea.className = "message error";
      }
    } else {
      messageArea.textContent = `Hint: ${data.hint}`;
      messageArea.className = "message hint";
      guessesRemainingElement.textContent = `Guesses remaining: ${data.guessesRemaining}`;
    }
  } catch (error) {
    messageArea.textContent = "Failed to connect to the server.";
    messageArea.className = "message error";
  } finally {
    guessInput.value = "";
    if (!messageArea.textContent?.startsWith("You have already")) {
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

// Initial greeting
messageArea.textContent = "Guess a word to start the puzzle!";
guessesRemainingElement.textContent = "You have 10 guesses.";
