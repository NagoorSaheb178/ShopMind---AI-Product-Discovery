import { useState } from "react";
import styles from "./ProductCard.module.css";

const FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect fill='%23f0ece5' width='600' height='400'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='16' fill='%23b0a898' text-anchor='middle' dy='.3em'%3ENo image%3C/text%3E%3C/svg%3E";

const StarRating = ({ rating }) => (
  <div className={styles.stars}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span
        key={i}
        className={
          i <= Math.floor(rating)
            ? styles.starFull
            : i - 0.5 <= rating
            ? styles.starHalf
            : styles.starEmpty
        }
      >
        ★
      </span>
    ))}
  </div>
);

export default function ProductCard({ product, reasoning, isRecommended, rank }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <article
      className={`${styles.card} ${isRecommended ? styles.recommended : ""}`}
      id={`product-card-${product.id}`}
    >
      {/* Rank badge */}
      {isRecommended && rank && (
        <div className={styles.rankBadge}>#{rank} Pick</div>
      )}

      {/* Product image */}
      <div className={styles.imgBox}>
        {!imgLoaded && !imgError && <div className={styles.imgSkeleton} />}
        <img
          src={imgError ? FALLBACK : product.image}
          alt={product.name}
          className={`${styles.img} ${imgLoaded ? styles.imgVisible : ""}`}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true); }}
          loading="lazy"
        />
        {!product.inStock && (
          <div className={styles.outOfStockOverlay}>Out of Stock</div>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Brand + category */}
        <div className={styles.meta}>
          <span className={styles.brand}>{product.brand}</span>
          <span className={styles.categoryDot} />
          <span className={styles.category}>{product.category}</span>
        </div>

        {/* Name */}
        <h3 className={styles.name}>{product.name}</h3>

        {/* Description */}
        <p className={styles.desc}>{product.description}</p>

        {/* Tags */}
        <div className={styles.tags}>
          {product.tags.slice(0, 3).map((t) => (
            <span key={t} className={styles.tag}>{t}</span>
          ))}
        </div>

        {/* AI reasoning */}
        {reasoning && (
          <div className={styles.reasoning}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={styles.reasoningIcon}>
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5v5l3 3" />
            </svg>
            <p className={styles.reasoningText}>{reasoning}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.ratingRow}>
          <StarRating rating={product.rating} />
          <span className={styles.ratingVal}>{product.rating}</span>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.price}>${product.price.toLocaleString()}</span>
          <button
            id={`add-to-cart-${product.id}`}
            className={`${styles.cartBtn} ${!product.inStock ? styles.cartBtnDisabled : ""}`}
            disabled={!product.inStock}
          >
            {product.inStock ? "Add to Cart" : "Notify Me"}
          </button>
        </div>
      </div>
    </article>
  );
}
