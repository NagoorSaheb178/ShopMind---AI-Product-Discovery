import styles from "./LoadingState.module.css";

const LOADING_MESSAGES = [
  "Analyzing your preferences…",
  "Browsing through 25 products…",
  "Finding the best matches…",
  "Almost there…",
];

export default function LoadingState() {
  return (
    <div className={styles.container} id="loading-state">
      <div className={styles.spinner}>
        <div className={styles.ring}></div>
        <div className={styles.ring}></div>
        <div className={styles.ring}></div>
      </div>
      <div className={styles.messages}>
        {LOADING_MESSAGES.map((msg, i) => (
          <span
            key={i}
            className={styles.message}
            style={{ animationDelay: `${i * 0.8}s` }}
          >
            {msg}
          </span>
        ))}
      </div>
      <div className={styles.skeleton}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonCard}>
            <div className={styles.skeletonHeader}></div>
            <div className={styles.skeletonLine}></div>
            <div className={styles.skeletonLine} style={{ width: "70%" }}></div>
            <div className={styles.skeletonFooter}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
