// src/pages/Landing.jsx
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import "./Landing.css";

export default function Landing() {
  const [feedback, setFeedback] = useState({
    name: "",
    message: "",
    rating: "5",
  });
  const [sent, setSent] = useState(false);

  const canSend = useMemo(() => {
    return feedback.message.trim().length > 0;
  }, [feedback.message]);

  function onSubmit(e) {
    e.preventDefault();
    if (!canSend) return;

    // Later: send to backend / supabase
    console.log("Gradeify feedback:", feedback);

    setSent(true);
    setFeedback({ name: "", message: "", rating: "5" });
    window.setTimeout(() => setSent(false), 3500);
  }

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
            <h2>Send feedback</h2>
            <p>
              If something’s helpful, tell us — and if something’s annoying,
              tell us that too.
            </p>
          </div>

          <form className="feedbackForm" onSubmit={onSubmit}>
            <div className="row">
              <label>
                Your name (optional)
                <input
                  value={feedback.name}
                  onChange={(e) =>
                    setFeedback((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g., Sam"
                />
              </label>

              <label>
                Rating
                <select
                  value={feedback.rating}
                  onChange={(e) =>
                    setFeedback((f) => ({ ...f, rating: e.target.value }))
                  }
                >
                  <option value="5">5 - Loved it</option>
                  <option value="4">4 - Really good</option>
                  <option value="3">3 - It’s okay</option>
                  <option value="2">2 - Needs work</option>
                  <option value="1">1 - Not great</option>
                </select>
              </label>
            </div>

            <label>
              Message
              <textarea
                value={feedback.message}
                onChange={(e) =>
                  setFeedback((f) => ({ ...f, message: e.target.value }))
                }
                placeholder="What should we keep? What should we change?"
                required
              />
            </label>

            <button className="btnPrimary" type="submit" disabled={!canSend}>
              Submit feedback →
            </button>

            {sent && (
              <div
                className="note"
                style={{
                  marginTop: 10,
                  background: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.18)",
                  borderRadius: 12,
                  padding: 10,
                  color: "var(--text-main)",
                  fontWeight: 800,
                }}
              >
                Thanks — feedback sent!
              </div>
            )}

            <div className="note">
              Next step: save this to Supabase and display the best comments on
              the homepage.
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
