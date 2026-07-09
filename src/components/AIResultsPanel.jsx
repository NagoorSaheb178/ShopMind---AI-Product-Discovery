import styles from "./AIResultsPanel.module.css";

/**
 * Shows the AI explanation as it streams in.
 * `streamingRaw` = raw accumulated JSON string (may be partial/incomplete)
 * `finalResult`  = fully parsed result object (set when stream ends)
 * `isStreaming`  = true while tokens are arriving
 */
export default function AIResultsPanel({ streamingRaw, finalResult, isStreaming, query }) {
  // Try to extract a partial explanation from the raw stream for live display
  let displayText = "";
  let displayIds = [];

  if (finalResult) {
    // Stream done — use clean parsed data
    displayText = finalResult.explanation;
    displayIds = finalResult.recommendedIds;
  } else if (streamingRaw) {
    // Try to extract explanation even from partial JSON
    const expMatch = streamingRaw.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (expMatch) displayText = expMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');

    // Try to extract any IDs already streamed
    const idsMatch = streamingRaw.match(/"recommendedIds"\s*:\s*\[([^\]]*)/);
    if (idsMatch) {
      displayIds = idsMatch[1]
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
    }
  }

  return (
    <div className={styles.panel} id="ai-results-panel">
      <div className={styles.header}>
        <div className={`${styles.aiIcon} ${isStreaming ? styles.aiIconPulse : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z" />
            <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
            <path d="M12 12v2" />
          </svg>
        </div>
        <div className={styles.headerText}>
          <span className={styles.aiLabel}>
            {isStreaming ? (
              <span className={styles.streamingLabel}>
                Analyzing
                <span className={styles.streamingDots}>
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </span>
            ) : (
              "AI Results"
            )}
          </span>
          <span className={styles.queryText}>
            Results for: <em>&ldquo;{query}&rdquo;</em>
          </span>
        </div>

        {/* Live token counter while streaming */}
        {isStreaming && streamingRaw && (
          <div className={styles.tokenCounter}>
            {streamingRaw.length} chars
          </div>
        )}

        {/* Matched count badge when done */}
        {!isStreaming && displayIds.length > 0 && (
          <div className={styles.matchBadge}>
            {displayIds.length} matches found
          </div>
        )}
      </div>

      {/* Explanation — streams in live */}
      <div className={styles.explanationBlock}>
        {displayText ? (
          <p className={styles.explanation}>
            {displayText}
            {isStreaming && <span className={styles.cursor} />}
          </p>
        ) : isStreaming ? (
          <p className={styles.waitingText}>
            <span className={styles.cursor} /> Analyzing your preferences…
          </p>
        ) : null}
      </div>

      {/* Live streaming raw JSON preview (collapsed, dev-friendly) */}
      {isStreaming && streamingRaw && !displayText && (
        <div className={styles.rawPreview}>
          <span className={styles.rawLabel}>Streaming…</span>
          <span className={styles.rawSnippet}>
            {streamingRaw.slice(-60)}
          </span>
        </div>
      )}
    </div>
  );
}
