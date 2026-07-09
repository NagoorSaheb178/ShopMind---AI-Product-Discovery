import { useState, useRef } from "react";
import styles from "./SearchBar.module.css";

const SUGGESTIONS = [
  "Phone under $500 with great camera",
  "Best laptop for gaming under $1500",
  "Wireless headphones with noise cancellation",
  "Budget tablet for streaming",
  "Smartwatch for fitness tracking",
  "Lightweight laptop for students",
];

export default function SearchBar({ onSearch, onLiveChange, isLoading }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onLiveChange?.(val); // fires debounced AI search in parent
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
    }
  };

  const handleSuggestion = (s) => {
    setQuery(s);
    onSearch(s);
    setFocused(false);
    inputRef.current?.blur();
  };

  const clearQuery = () => {
    setQuery("");
    onLiveChange?.("");
    inputRef.current?.focus();
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={`${styles.inputWrap} ${focused ? styles.inputWrapFocused : ""} ${isLoading ? styles.inputWrapActive : ""}`}>
          {/* Search icon / spinner */}
          <span className={`${styles.icon} ${isLoading ? styles.iconSpin : ""}`}>
            {isLoading ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </span>

          <input
            id="product-search-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder='Try "phone under $500 with great camera"…'
            className={styles.input}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Live indicator */}
          {isLoading && (
            <span className={styles.liveTag}>AI</span>
          )}

          {query && !isLoading && (
            <button type="button" className={styles.clearBtn} onClick={clearQuery} aria-label="Clear">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            id="get-recommendations-btn"
            type="submit"
            className={styles.submitBtn}
            disabled={!query.trim() || isLoading}
          >
            Search
          </button>
        </div>
      </form>

      {/* Suggestion chips */}
      {!isLoading && (
        <div className={styles.chips}>
          <span className={styles.chipsLabel}>Popular:</span>
          {SUGGESTIONS.slice(0, 4).map((s, i) => (
            <button key={i} className={styles.chip} onClick={() => handleSuggestion(s)} type="button">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
