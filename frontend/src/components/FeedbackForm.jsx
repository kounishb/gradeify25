import { useState } from "react";
import { submitFeedback } from "../api/manual";

export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [name, setName] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await submitFeedback({
        message,
        rating,
        username: name.trim(),
      });

      setSuccessMsg("Thanks for your feedback.");
      setMessage("");
      setRating(5);
      setName("");
    } catch (err) {
      setErrorMsg(err?.message || "Could not submit feedback.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="feedback-form">
      <h2>Share Feedback</h2>

      <label>
        Rating
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          <option value={5}>5 - Excellent</option>
          <option value={4}>4 - Good</option>
          <option value={3}>3 - Okay</option>
          <option value={2}>2 - Needs work</option>
          <option value={1}>1 - Poor</option>
        </select>
      </label>

      <label>
        Your name (optional)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Sam"
        />
      </label>

      <label>
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you liked or what we should improve..."
          rows={5}
          required
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit Feedback"}
      </button>

      {successMsg && <p>{successMsg}</p>}
      {errorMsg && <p>{errorMsg}</p>}
    </form>
  );
}