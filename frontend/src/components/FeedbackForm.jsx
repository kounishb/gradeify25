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
      <h3 className="feedback-form-title">Share Feedback</h3>

      <div className="feedback-field">
        <label htmlFor="rating">Rating</label>
        <select
          id="rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          <option value={5}>5 - Excellent</option>
          <option value={4}>4 - Good</option>
          <option value={3}>3 - Okay</option>
          <option value={2}>2 - Needs work</option>
          <option value={1}>1 - Poor</option>
        </select>
      </div>

      <div className="feedback-field">
        <label htmlFor="name">Your name (optional)</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Sam"
        />
      </div>

      <div className="feedback-field">
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you liked or what we should improve..."
          rows={5}
          required
        />
      </div>

      <button type="submit" className="feedback-submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit Feedback"}
      </button>

      {successMsg && <p className="feedback-success">{successMsg}</p>}
      {errorMsg && <p className="feedback-error">{errorMsg}</p>}
    </form>
  );
}