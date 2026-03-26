// src/pages/Landing.jsx
import { Link } from "react-router-dom";
import { useState } from "react";
import "./Landing.css";
import FeedbackForm from "../components/FeedbackForm.jsx";
import PublicFeedback from "../components/PublicFeedback.jsx";

export default function Landing() {
  return (
    <div className="landing">
      <header className="nav">
        <div className="container navInner">
          <div className="brand">
            <div className="logoMark">G</div>
            <div className="logoText">Gradeify</div>
          </div>

          <nav className="navLinks">
            <a href="#features">Features</a>
            <a href="#feedback">Feedback</a>
          </nav>

          {/* Keep ONE login entry point: navbar only */}
          <div className="navActions">
            <Link className="btnSecondary" to="/login">
              Login
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        {/* HERO */}
        <section className="hero">
          <h1 className="heroTitle">
            Study smarter.
            <br />
            Practice better.
            <br />
            Stress less.
          </h1>

          <p className="heroSubtitle">
            <strong>Gradeify</strong> helps you learn faster with a{" "}
            <b>practice test generator</b>, quick review tools, and clear grade
            calculations — built for real school workflows.
          </p>

          {/* Single primary CTA */}
          <div className="heroActions">
            <Link className="btnPrimary big" to="/register">
              Get started →
            </Link>
          </div>

          <div className="heroStats">
            <div className="stat">
              <div className="statTop">Practice Test Generator</div>
              <div className="statBottom">Make questions in seconds</div>
            </div>
            <div className="stat">
              <div className="statTop">Learn Tools</div>
              <div className="statBottom">Review with structure</div>
            </div>
            <div className="stat">
              <div className="statTop">Grade Math</div>
              <div className="statBottom">Know what you need</div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="section">
          <div className="sectionHead">
            <h2>What Gradeify helps you do</h2>
            <p>Fast to use, clean outputs, and actually useful for studying.</p>
          </div>

          <div className="cards">
            <div className="card">
              <div className="cardIcon">📝</div>
              <h3>Generate practice tests</h3>
              <p>Create questions by topic and quiz yourself before exams.</p>
            </div>

            <div className="card">
              <div className="cardIcon">🧠</div>
              <h3>Review concepts quickly</h3>
              <p>Use learning tools to understand topics and reinforce them.</p>
            </div>

            <div className="card">
              <div className="cardIcon">📈</div>
              <h3>Plan your grades</h3>
              <p>Weighted categories + “what do I need?” made simple.</p>
            </div>
          </div>
        </section>

        {/* FEEDBACK */}
        <section id="feedback" className="section">
          <div className="sectionHead">
            <h2>What students are saying</h2>
            <p>Real feedback from Gradeify users.</p>
          </div>

          <PublicFeedback />

          <div className="sectionHead" style={{ marginTop: 40 }}>
            <h2>Send feedback</h2>
            <p>
              If something’s helpful, tell us — and if something’s annoying,
              tell us that too.
            </p>
          </div>

          <FeedbackForm />
        </section>
      </main>
    </div>
  );
}
