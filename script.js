"use strict";

const SAVE_URL =
  "https://script.google.com/macros/s/AKfycbz1pEJ95xrX5q_HCUV0_KzoVGRMyPNJznzf3jggF6p7zzJXp-Kg2g8QIPw25fyfCos55A/exec"; //This is the Apps Script we created to write the responses from the website to a Google Sheet

// Page elements
const introPanel = document.getElementById("intro-panel");
const assessmentPanel = document.getElementById("assessment-panel");
const resultsPanel = document.getElementById("results-panel");

const loadingStatus = document.getElementById("loading-status");
const startButton = document.getElementById("start-button");

const assessmentHeading = document.getElementById("assessment-heading");
const progressText = document.getElementById("progress-text");
const emailImage = document.getElementById("email-image");
const imageStatus = document.getElementById("image-status");
const legitimateButton = document.getElementById("legitimate-button");
const phishingButton = document.getElementById("phishing-button");

const resultsHeading = document.getElementById("results-heading");
const finalScore = document.getElementById("final-score");
const participantIdDisplay = document.getElementById("participant-id");
const saveScoreButton = document.getElementById("save-score-button");
const saveStatus = document.getElementById("save-status");

// Game state
let emailPool = [];
let questionsPerGame = 0;
let selectedEmails = [];
let responses = [];
let currentIndex = 0;
let participantId = "";
let gameStartedAt = "";
let questionShownAt = "";
let questionStartTime = 0;
let acceptingAnswer = false;
let completedGame = null;

// Load and check the email catalog.
async function loadEmails() {
  try {
    const response = await fetch("./emails.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Could not load emails.json (${response.status}).`);
    }

    const data = await response.json();

    if (
      !Number.isInteger(data.questionsPerGame) ||
      data.questionsPerGame < 1
    ) {
      throw new Error("questionsPerGame must be a positive whole number.");
    }

    if (!Array.isArray(data.emails) || data.emails.length === 0) {
      throw new Error("The email catalog must contain at least one email.");
    }

    const usedIds = new Set();
    const usedImages = new Set();

    for (const email of data.emails) {
      if (
        !email ||
        typeof email.id !== "string" ||
        email.id.trim() === "" ||
        typeof email.image !== "string" ||
        email.image.trim() === "" ||
        !["legitimate", "phishing"].includes(email.answer)
      ) {
        throw new Error("An email entry has a missing or invalid field.");
      }

      if (usedIds.has(email.id) || usedImages.has(email.image)) {
        throw new Error("Each email must have a unique ID and image path.");
      }

      usedIds.add(email.id);
      usedImages.add(email.image);
    }

    emailPool = data.emails;
    questionsPerGame = Math.min(
      data.questionsPerGame,
      emailPool.length
    );

    loadingStatus.textContent =
      `${questionsPerGame} emails. How many can you spot?`;

    startButton.disabled = false;
  } catch (error) {
    loadingStatus.textContent =
      "The game couldn't load. Check emails.json, then refresh the page.";

    console.error(error);
  }
}

// Shuffle a copy so the original catalog stays intact.
function shuffleEmails(emails) {
  const shuffled = [...emails];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[randomIndex]] =
      [shuffled[randomIndex], shuffled[i]];
  }

  return shuffled;
}

function setAnswerButtonsEnabled(enabled) {
  legitimateButton.disabled = !enabled;
  phishingButton.disabled = !enabled;
}

// Begin a fresh game with a random subset.
function startGame() {
  startButton.disabled = true;

  participantId = crypto.randomUUID();
  gameStartedAt = new Date().toISOString();

  selectedEmails = shuffleEmails(emailPool).slice(
    0,
    questionsPerGame
  );

  responses = [];
  currentIndex = 0;
  completedGame = null;

  introPanel.hidden = true;
  resultsPanel.hidden = true;
  assessmentPanel.hidden = false;

  showEmail();
}

// Show the current image and wait for it to load before accepting answers.
function showEmail() {
  acceptingAnswer = false;
  setAnswerButtonsEnabled(false);

  const email = selectedEmails[currentIndex];

  progressText.textContent =
    `Email ${currentIndex + 1} of ${selectedEmails.length}`;

  imageStatus.textContent = "Loading email…";
  emailImage.hidden = true;
  emailImage.alt = `Email ${currentIndex + 1} to classify`;

  emailImage.onload = () => {
    emailImage.hidden = false;
    imageStatus.textContent = "";

    questionShownAt = new Date().toISOString();
    questionStartTime = performance.now();

    acceptingAnswer = true;
    setAnswerButtonsEnabled(true);
    assessmentHeading.focus();
  };

  emailImage.onerror = () => {
    imageStatus.textContent =
      "This email image couldn't load. Check its filename and refresh to try again.";

    console.error("Could not load email image:", email.image);
  };

  emailImage.src = email.image;
}

// Record a choice without showing whether it was correct.
function recordAnswer(choice) {
  if (!acceptingAnswer) {
    return;
  }

  acceptingAnswer = false;
  setAnswerButtonsEnabled(false);

  const email = selectedEmails[currentIndex];

  responses.push({
    participant_id: participantId,
    question_number: currentIndex + 1,
    email_id: email.id,
    image_path: email.image,
    selected_answer: choice,
    correct_answer: email.answer,
    is_correct: choice === email.answer,
    shown_at: questionShownAt,
    answered_at: new Date().toISOString(),
    response_time_ms: Math.round(
      performance.now() - questionStartTime
    )
  });

  currentIndex++;

  if (currentIndex < selectedEmails.length) {
    showEmail();
  } else {
    finishGame();
  }
}

// Calculate the final score and keep the detailed data ready for saving.
function finishGame() {
  const score = responses.filter(
    (response) => response.is_correct
  ).length;

  completedGame = {
    submission_id: crypto.randomUUID(),
    participant_id: participantId,
    started_at: gameStartedAt,
    completed_at: new Date().toISOString(),
    score,
    total_questions: selectedEmails.length,
    responses: [...responses]
  };

  assessmentPanel.hidden = true;
  resultsPanel.hidden = false;

  finalScore.textContent = `${score} / ${selectedEmails.length}`;
  participantIdDisplay.textContent = participantId;
  saveStatus.textContent = "";

  resultsHeading.focus();
}

// Function to send High Score to Google Sheets
async function saveHighScore() {
  if (!completedGame || saveScoreButton.disabled) {
    return;
  }

  saveScoreButton.disabled = true;
  saveScoreButton.textContent = "Saving…";
  saveStatus.textContent = "Sending your results…";

  try {
    const response = await fetch(SAVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: JSON.stringify(completedGame),
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`The receiver returned ${response.status}.`);
    }

    const result = await response.json();

    if (
      result.success !== true ||
      result.submission_id !== completedGame.submission_id
    ) {
      throw new Error(
        result.message || "The receiver did not confirm this submission."
      );
    }

    saveScoreButton.textContent = "Score saved!";
    saveStatus.textContent =
      "Your score and email responses have been saved.";

  } catch (error) {
    console.error("Score saving failed:", error);

    saveScoreButton.disabled = false;
    saveScoreButton.textContent = "Retry saving";

    saveStatus.textContent =
      "We couldn't confirm the save. Please retry before closing this page.";
  }
}


// Button actions
startButton.addEventListener("click", startGame);

legitimateButton.addEventListener("click", () => {
  recordAnswer("legitimate");
});

phishingButton.addEventListener("click", () => {
  recordAnswer("phishing");
});

saveScoreButton.addEventListener("click", saveHighScore);

// Prepare the start screen.
loadEmails();
