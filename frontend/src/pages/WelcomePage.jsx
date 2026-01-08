// src/pages/WelcomePage.jsx
import { Link } from "react-router-dom";

export default function WelcomePage() {
  return (
    <div
      style={{
        background: "var(--bg-soft)",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
      }}
    >
      <h2
        style={{
          fontSize: "1.8rem",
          marginBottom: "0.5rem",
          color: "var(--text)",
        }}
      >
        Welcome to Gradeify 👋
      </h2>

      <p style={{ marginBottom: "1.5rem", color: "var(--text-muted)" }}>
        Track your grades, test what-if scenarios, and use AI-powered study
        tools tailored to your classes.
      </p>

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {/* Card 1 - Classes */}
        <div
          style={{
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid var(--accent-soft)",
            background: "var(--bg-soft)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.5rem",
              color: "var(--text)",
            }}
          >
            1. Add / view your classes
          </h3>

          <p
            style={{
              fontSize: "0.9rem",
              marginBottom: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            Manage your current courses, weights, and assignments.
          </p>

          <Link
            to="/app/classes"
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "var(--accent)",
              color: "white",
              textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            Go to Classes →
          </Link>
        </div>

        {/* Card 2 - Learn */}
        <div
          style={{
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid var(--accent-soft)",
            background: "var(--bg-soft)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.5rem",
              color: "var(--text)",
            }}
          >
            2. Learn – practice generator
          </h3>

          <p
            style={{
              fontSize: "0.9rem",
              marginBottom: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            Generate custom AI practice tests for any subject, answer the
            questions, and instantly see your score and explanations.
          </p>

          <Link
            to="/app/learn"
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "var(--accent)",
              color: "white",
              textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            Go to Learn →
          </Link>
        </div>

        {/* Card 3 - Future stuff */}
        <div
          style={{
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid var(--accent-soft)",
            background: "var(--bg-soft)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.5rem",
              color: "var(--text)",
            }}
          >
            3. Study tips & resources
          </h3>

          <p
            style={{
              fontSize: "0.9rem",
              marginBottom: 0,
              color: "var(--text-muted)",
            }}
          >
            Get study ideas based on which classes you&apos;re struggling in.
            (This is where your next educational features will go.)
          </p>
        </div>
      </div>
    </div>
  );
}
