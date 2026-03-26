import { useEffect, useState } from "react";
import { getPublicFeedback } from "../api/manual";
import "./PublicFeedback.css";

function Stars({ rating }) {
  const r = Number(rating) || 0;
  return (
    <div className="stars">
      {"★".repeat(r)}
      {"☆".repeat(5 - r)}
    </div>
  );
}

export default function PublicFeedback() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPublicFeedback();
        setFeedback(data.feedback || []);
      } catch (e) {
        console.error("Failed to load feedback", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p>Loading feedback...</p>;
  if (!feedback.length) return null;

  return (
    <div className="feedbackGrid">
      {feedback.slice(0, 6).map((f) => (
        <div key={f.id} className="feedbackCard">
          <Stars rating={f.rating} />
          <p className="feedbackText">“{f.message}”</p>
          <div className="feedbackUser">
            — {f.username || "Anonymous"}
          </div>
        </div>
      ))}
    </div>
  );
}