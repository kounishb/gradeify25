import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import TowerDefenseGame from "../components/games/TowerDefenseGame";
import "../styles/Games.css";

function normalizeFlashcards(cards = []) {
  return cards
    .map((card, index) => {
      const term = card.term || card.front || card.question || `Term ${index + 1}`;
      const definition = card.definition || card.back || card.answer || "";

      return {
        id: card.id || `flashcard-${index}`,
        type: "flashcard",
        question: `What does "${term}" mean?`,
        correctAnswer: definition,
        sourceTerm: term,
      };
    })
    .filter((q) => q.question && q.correctAnswer);
}

function normalizePracticeQuestions(questions = []) {
  return questions
    .map((q, index) => {
      const questionText = q.question || q.prompt || q.text || "";
      const correctAnswer =
        q.correctAnswer ||
        q.answer ||
        q.correct ||
        q.solution ||
        "";

      let choices = q.choices || q.options || [];

      if (!Array.isArray(choices)) {
        choices = [];
      }

      return {
        id: q.id || `practice-${index}`,
        type: "practice",
        question: questionText,
        correctAnswer,
        choices,
      };
    })
    .filter((q) => q.question && q.correctAnswer);
}

function loadPossibleStudySets() {
  const sets = [];

  try {
    const flashcardKeys = [
      "gradeify_flashcards",
      "savedFlashcards",
      "flashcards",
      "gradeify_saved_flashcards",
    ];

    flashcardKeys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        sets.push({
          id: key,
          title: "Saved Flashcards",
          type: "flashcards",
          questions: normalizeFlashcards(parsed),
        });
      } else if (parsed?.cards && Array.isArray(parsed.cards)) {
        sets.push({
          id: key,
          title: parsed.title || "Saved Flashcards",
          type: "flashcards",
          questions: normalizeFlashcards(parsed.cards),
        });
      } else if (Array.isArray(parsed?.sets)) {
        parsed.sets.forEach((set, index) => {
          sets.push({
            id: `${key}-${index}`,
            title: set.title || set.name || `Flashcard Set ${index + 1}`,
            type: "flashcards",
            questions: normalizeFlashcards(set.cards || []),
          });
        });
      }
    });

    const testKeys = [
      "gradeify_practice_tests",
      "savedPracticeTests",
      "practiceTests",
      "gradeify_saved_tests",
    ];

    testKeys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        parsed.forEach((test, index) => {
          const questions = test.questions || test.items || [];
          sets.push({
            id: `${key}-${index}`,
            title: test.title || test.name || `Practice Test ${index + 1}`,
            type: "practice",
            questions: normalizePracticeQuestions(questions),
          });
        });
      } else if (Array.isArray(parsed?.questions)) {
        sets.push({
          id: key,
          title: parsed.title || "Saved Practice Test",
          type: "practice",
          questions: normalizePracticeQuestions(parsed.questions),
        });
      }
    });
  } catch (err) {
    console.warn("Could not load study sets from localStorage:", err);
  }

  return sets.filter((set) => set.questions.length > 0);
}

const demoQuestions = [
  {
    id: "demo-1",
    type: "practice",
    question: "What is genetic drift?",
    correctAnswer: "A change in allele frequency due to random chance",
    choices: [
      "A change in allele frequency due to random chance",
      "Movement of alleles between populations",
      "Survival of the most physically powerful organism",
      "The creation of new species through isolation",
    ],
  },
  {
    id: "demo-2",
    type: "practice",
    question: "What is gene flow?",
    correctAnswer: "Movement of alleles between populations",
    choices: [
      "Random change in allele frequency",
      "Movement of alleles between populations",
      "A mutation that always helps survival",
      "The splitting of sister chromatids",
    ],
  },
  {
    id: "demo-3",
    type: "practice",
    question: "What does natural selection act on?",
    correctAnswer: "Phenotypes",
    choices: ["Phenotypes", "Only recessive alleles", "Only DNA directly", "Only gametes"],
  },
  {
    id: "demo-4",
    type: "practice",
    question: "What is a homologous chromosome?",
    correctAnswer: "A chromosome pair with the same genes, one from each parent",
    choices: [
      "Two identical copies made during S phase",
      "A chromosome pair with the same genes, one from each parent",
      "A chromosome found only in gametes",
      "A chromosome with no centromere",
    ],
  },
];

export default function Games() {
  const location = useLocation();
  const [selectedSetId, setSelectedSetId] = useState("demo");
  const [gameStarted, setGameStarted] = useState(false);

  const routeQuestions = useMemo(() => {
    const state = location.state || {};

    if (Array.isArray(state.flashcards)) {
      return [
        {
          id: "route-flashcards",
          title: state.title || "Shared Flashcards",
          type: "flashcards",
          questions: normalizeFlashcards(state.flashcards),
        },
      ];
    }

    if (Array.isArray(state.questions)) {
      return [
        {
          id: "route-practice",
          title: state.title || "Shared Practice Test",
          type: "practice",
          questions: normalizePracticeQuestions(state.questions),
        },
      ];
    }

    return [];
  }, [location.state]);

  const studySets = useMemo(() => {
    const localSets = loadPossibleStudySets();

    return [
      ...routeQuestions,
      ...localSets,
      {
        id: "demo",
        title: "Demo Biology Questions",
        type: "demo",
        questions: demoQuestions,
      },
    ];
  }, [routeQuestions]);

  const selectedSet = studySets.find((set) => set.id === selectedSetId) || studySets[0];

  if (gameStarted) {
    return (
      <TowerDefenseGame
        studySet={selectedSet}
        onExit={() => setGameStarted(false)}
      />
    );
  }

  return (
    <div className="games-page">
      <div className="games-hero">
        <div>
          <p className="games-eyebrow">Gradeify Games</p>
          <h1>Turn studying into strategy.</h1>
          <p>
            Start with a tower defense game where flashcards and practice test
            questions become the way you earn coins, build towers, and survive waves.
          </p>
        </div>
      </div>

      <div className="games-grid">
        <div className="game-card featured-game-card">
          <div className="game-card-top">
            <div>
              <p className="game-label">Featured Game</p>
              <h2>Study Siege</h2>
            </div>
            <span className="game-pill">Tower Defense</span>
          </div>

          <p className="game-description">
            Answer questions correctly to earn coins. Use those coins to place towers,
            upgrade your defense, and stop enemies before they reach your base.
          </p>

          <div className="study-set-picker">
            <label>Choose study material</label>
            <select
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
            >
              {studySets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.title} · {set.questions.length} questions
                </option>
              ))}
            </select>
          </div>

          <div className="game-details-row">
            <div>
              <strong>{selectedSet?.questions.length || 0}</strong>
              <span>Questions</span>
            </div>
            <div>
              <strong>5+</strong>
              <span>Waves</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Tower Types</span>
            </div>
          </div>

          <button
            className="start-game-btn"
            onClick={() => setGameStarted(true)}
          >
            Start Study Siege
          </button>
        </div>

        <div className="game-card locked-game-card">
          <span className="game-pill muted">Coming Soon</span>
          <h2>Flashcard Dash</h2>
          <p>
            A fast-paced runner game where answering questions gives boosts,
            shields, and extra lives.
          </p>
        </div>

        <div className="game-card locked-game-card">
          <span className="game-pill muted">Coming Soon</span>
          <h2>Quiz Dungeon</h2>
          <p>
            A 2D dungeon crawler where correct answers deal damage and unlock rooms.
          </p>
        </div>
      </div>
    </div>
  );
}