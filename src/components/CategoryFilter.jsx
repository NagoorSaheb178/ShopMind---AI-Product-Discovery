import styles from "./CategoryFilter.module.css";

export default function CategoryFilter({ categories, selected, onSelect }) {
  return (
    <div className={styles.filterBar} id="category-filter-bar" role="tablist">
      {categories.map((cat) => (
        <button
          key={cat}
          id={`filter-${cat.toLowerCase()}`}
          role="tab"
          aria-selected={selected === cat}
          className={`${styles.filterBtn} ${selected === cat ? styles.active : ""}`}
          onClick={() => onSelect(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
