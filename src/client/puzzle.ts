export interface PuzzleData {
  hint_vocabulary: string[];
  hint_embeddings: number[][];
}

export interface GameState {
  targetWord: string;
  targetEmbedding: number[];
  guessesHistory: string[];
  usedHints: string[];
  solved?: boolean;
}

/**
 * Calculates the cosine distance between two vectors.
 * @param vecA The first vector.
 * @param vecB The second vector.
 * @returns The cosine distance.
 */
export function cosineDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    magA += vecA[i]! * vecA[i]!;
    magB += vecB[i]! * vecB[i]!;
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 1; // Cosine distance is 1 if one or both vectors are zero vectors.
  }

  const similarity = dotProduct / (magA * magB);
  return 1 - similarity;
}

class PuzzleManager {
  private static instance: PuzzleManager;
  private readonly puzzleData: PuzzleData;
  private readonly wordToEmbedding: Map<string, number[]> = new Map();
  private shuffledVocabulary: string[] = [];

  private constructor(puzzleData: PuzzleData) {
    this.puzzleData = puzzleData;
    for (let i = 0; i < this.puzzleData.hint_vocabulary.length; i++) {
      const word = this.puzzleData.hint_vocabulary[i];
      const embedding = this.puzzleData.hint_embeddings[i];
      if (word && embedding) {
        this.wordToEmbedding.set(word, embedding);
      }
    }
    console.log(
      `Loaded ${this.wordToEmbedding.size} words into puzzle manager.`
    );

    // Shuffle the vocabulary with a fixed seed for deterministic rotation
    this.shuffledVocabulary = [...this.puzzleData.hint_vocabulary];
    this.shuffleWithSeed(this.shuffledVocabulary, "devvit-rocks");
    console.log("Vocabulary shuffled for rotating targets.");
  }

  // Fisher-Yates shuffle with a seeded pseudo-random number generator
  private shuffleWithSeed(array: any[], seed: string) {
    let i = 0;
    const random = () => {
      const x = Math.sin(i++) * 10000;
      return x - Math.floor(x);
    };

    let m = array.length,
      t,
      j;

    while (m) {
      j = Math.floor(random() * m--);
      t = array[m];
      array[m] = array[j];
      array[j] = t;
    }
    return array;
  }

  public static getInstance(puzzleData: PuzzleData): PuzzleManager {
    if (!PuzzleManager.instance) {
      PuzzleManager.instance = new PuzzleManager(puzzleData);
    }
    return PuzzleManager.instance;
  }

  public getShuffledVocabulary(): string[] {
    return this.shuffledVocabulary;
  }

  public getVocabulary(): string[] {
    return this.puzzleData.hint_vocabulary;
  }

  public getEmbedding(word: string): number[] | undefined {
    return this.wordToEmbedding.get(word);
  }

  public findHint(guess: string, gameState: GameState): string {
    const guessEmbedding = this.getEmbedding(guess);
    if (!guessEmbedding) {
      return "unknown"; // Should not happen if guess is validated before calling
    }

    const targetEmbedding = gameState.targetEmbedding;

    const collinearityScores = this.puzzleData.hint_embeddings.map(
      (hintEmbedding) => {
        const guessDist = cosineDistance(guessEmbedding, hintEmbedding);
        const targetDist = cosineDistance(targetEmbedding, hintEmbedding);
        return guessDist + targetDist;
      }
    );

    const sortedIndices = [...Array(collinearityScores.length).keys()].sort(
      (a, b) => {
        return collinearityScores[a]! - collinearityScores[b]!;
      }
    );

    const D = cosineDistance(guessEmbedding, targetEmbedding);
    const min_dist_from_target = 0.33 * D;
    const min_dist_from_guesses = 0.5 * D;

    const allGuessesEmbeddings = gameState.guessesHistory
      .map((g) => this.getEmbedding(g))
      .filter((e): e is number[] => e !== undefined);

    for (const idx of sortedIndices) {
      const hintWord = this.puzzleData.hint_vocabulary[idx];
      const hintEmbedding = this.puzzleData.hint_embeddings[idx];

      if (!hintWord || !hintEmbedding) continue;

      // Basic invalidity checks
      if (
        hintWord === gameState.targetWord ||
        gameState.guessesHistory.includes(hintWord) ||
        gameState.usedHints.includes(hintWord)
      ) {
        continue;
      }

      // Substring check
      const wordsToCheck = [
        gameState.targetWord,
        ...gameState.guessesHistory,
        ...gameState.usedHints,
      ];
      if (
        wordsToCheck.some(
          (w) =>
            (w.length >= 3 && hintWord.includes(w)) ||
            (hintWord.length >= 3 && w.includes(hintWord))
        )
      ) {
        continue;
      }

      const distanceFromTarget = cosineDistance(targetEmbedding, hintEmbedding);

      const distancesFromGuesses = allGuessesEmbeddings.map((emb) =>
        cosineDistance(emb, hintEmbedding)
      );

      if (
        distanceFromTarget >= min_dist_from_target &&
        distancesFromGuesses.every((d) => d >= min_dist_from_guesses)
      ) {
        return hintWord;
      }
    }

    // Fallback: Find the best valid word without the distance constraint
    for (const idx of sortedIndices) {
      const hintWord = this.puzzleData.hint_vocabulary[idx];
      if (!hintWord) continue;

      if (
        hintWord === gameState.targetWord ||
        gameState.guessesHistory.includes(hintWord) ||
        gameState.usedHints.includes(hintWord)
      ) {
        continue;
      }
      const wordsToCheck = [
        gameState.targetWord,
        ...gameState.guessesHistory,
        ...gameState.usedHints,
      ];
      if (
        wordsToCheck.some(
          (w) =>
            (w.length >= 3 && hintWord.includes(w)) ||
            (hintWord.length >= 3 && w.includes(hintWord))
        )
      ) {
        continue;
      }
      return hintWord; // Return the best one that's not a repeat
    }

    return "unknown"; // Ultimate fallback
  }
}

export const getPuzzleManager = (puzzleData: PuzzleData): PuzzleManager => {
  return PuzzleManager.getInstance(puzzleData);
};
