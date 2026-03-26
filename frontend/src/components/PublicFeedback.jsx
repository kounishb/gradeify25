import { useEffect, useState } from "react";
import { getPublicFeedback } from "../api/manual";

export default function PublicFeedback() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadFeedback() {
      try {
        const data = await getPublicFeedback();
        setFeedback(data.feedback || []);
      } catch (err) {
        setErrorMsg(err?.message || "Could not load feedback.");
      } finally {
        setLoading(false);
      }
    }

    loadFeedback();
  }, []);

  if (loading) return <p>Loading feedback...</p>;
  if (errorMsg) return <p>{errorMsg}</p>;
  if (!feedback.length) return <p>No feedback to show yet.</p>;

  return (
    <section className="public-feedback">
      <h2>What Users Are Saying</h2>

      <div className="feedback-grid">
        {feedback.map((item) => (
          <div key={item.id} className="feedback-card">
            <p className="feedback-message">"{item.message}"</p>
            <p className="feedback-user">- {item.username || "Anonymous"}</p>
            {item.rating ? <p className="feedback-rating">Rating: {item.rating}/5</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}