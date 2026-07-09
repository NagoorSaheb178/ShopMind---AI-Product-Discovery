import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { PRODUCTS, CATEGORIES } from "./data/products";
import { streamAIRecommendations } from "./services/groqService";
import SearchBar from "./components/SearchBar";
import ProductCard from "./components/ProductCard";
import CategoryFilter from "./components/CategoryFilter";
import AIResultsPanel from "./components/AIResultsPanel";
import LoadingState from "./components/LoadingState";
import "./App.css";

const DEBOUNCE_MS = 800; // Lowered to feel more real-time, now that payload is smaller

export default function App() {
  const [query, setQuery]               = useState("");
  const [isStreaming, setIsStreaming]   = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const [finalResult, setFinalResult]   = useState(null);
  const [error, setError]               = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy]             = useState("default");

  const debounceRef = useRef(null);
  const abortRef    = useRef(null); // AbortController for current stream

  // ── Fire AI search ────────────────────────────────────────────────────
  const handleSearch = useCallback(async (userQuery) => {
    const trimmed = userQuery.trim();
    if (!trimmed) return;

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setQuery(trimmed);
    setIsStreaming(true);
    setStreamingRaw("");
    setFinalResult(null);
    setError(null);
    setSelectedCategory("All");

    try {
      const result = await streamAIRecommendations(
        trimmed,
        PRODUCTS,
        (accumulated) => setStreamingRaw(accumulated),
        abortRef.current.signal
      );

      // null means the request was aborted — don't update state
      if (result === null) return;

      setFinalResult(result);
    } catch (err) {
      if (err.name === "AbortError") return; // silently ignore aborts
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsStreaming(false);
    }
  }, []);

  // ── Debounced live-search ─────────────────────────────────────────────
  const handleLiveChange = useCallback((text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      // Abort current stream and clear results when input is emptied
      if (abortRef.current) abortRef.current.abort();
      setFinalResult(null);
      setStreamingRaw("");
      setIsStreaming(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => handleSearch(text), DEBOUNCE_MS);
  }, [handleSearch]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // ── Extract live IDs from partial JSON while streaming ────────────────
  const liveRecommendedIds = useMemo(() => {
    if (finalResult) return finalResult.recommendedIds;
    if (!streamingRaw) return [];
    const m = streamingRaw.match(/"recommendedIds"\s*:\s*\[([^\]]*)/);
    if (!m) return [];
    return m[1].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  }, [finalResult, streamingRaw]);

  // ── Build product lists ───────────────────────────────────────────────
  // When AI has results → show ONLY the recommended products (no "Other" section)
  // When no AI → show all products with sort/filter applied
  const browsableProducts = useMemo(() => {
    let prods = [...PRODUCTS];
    if (selectedCategory !== "All") prods = prods.filter((p) => p.category === selectedCategory);
    if (sortBy === "price-asc")  prods.sort((a, b) => a.price - b.price);
    if (sortBy === "price-desc") prods.sort((a, b) => b.price - a.price);
    if (sortBy === "rating")     prods.sort((a, b) => b.rating - a.rating);
    return prods;
  }, [selectedCategory, sortBy]);

  const recommendedProducts = useMemo(() => {
    if (liveRecommendedIds.length === 0) return [];
    return liveRecommendedIds
      .map((id) => PRODUCTS.find((p) => p.id === id))
      .filter(Boolean);
  }, [liveRecommendedIds]);

  const hasAIResults = isStreaming || !!finalResult;

  return (
    <div className="app">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="logoBlock">
          <div className="logoMark">S</div>
          <div>
            <span className="logoName">ShopMind</span>
            <span className="logoTagline">AI Product Discovery</span>
          </div>
        </div>

        <nav className="sideNav">
          <p className="sideNavLabel">Browse</p>
          <CategoryFilter
            categories={CATEGORIES}
            selected={selectedCategory}
            onSelect={(cat) => { setSelectedCategory(cat); }}
          />
        </nav>

        {!hasAIResults && (
          <div className="sideSort">
            <p className="sideNavLabel">Sort by</p>
            <select
              id="sort-select"
              className="sortSelect"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="default">Default</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        )}

        <div className="sideStats">
          <div className="statItem">
            <span className="statNum">{PRODUCTS.length}</span>
            <span className="statLabel">Products</span>
          </div>
          <div className="statItem">
            <span className="statNum">{CATEGORIES.length - 1}</span>
            <span className="statLabel">Categories</span>
          </div>
          {liveRecommendedIds.length > 0 && (
            <div className="statItem">
              <span className={`statNum ${isStreaming ? "statStreaming" : ""}`}>
                {liveRecommendedIds.length}
              </span>
              <span className="statLabel">Matches</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="main">
        {/* Mobile header */}
        <header className="topHeader">
          <div className="headerLeft">
            <div className="logoMarkSm">S</div>
            <span className="logoNameSm">ShopMind</span>
          </div>
          <div className={`headerBadge ${isStreaming ? "headerBadgeActive" : ""}`}>
            <span className={`badgeDot ${isStreaming ? "badgeDotActive" : ""}`} />
            {isStreaming ? "Searching…" : "AI Ready"}
          </div>
        </header>

        {/* Mobile category scroll */}
        <div className="mobileCategoryBar">
          <CategoryFilter
            categories={CATEGORIES}
            selected={selectedCategory}
            onSelect={(cat) => setSelectedCategory(cat)}
          />
        </div>

        {/* Mobile sort bar */}
        {!hasAIResults && (
          <div className="mobileSortBar">
            <select
              className="sortSelect mobileSortSelect"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="default">Sort by: Default</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        )}

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="heroText">
            <h1 className="heroTitle">
              Discover the <span className="heroAccent">perfect product</span>
              <br />with real-time AI
            </h1>
            <p className="heroSub">
              Describe what you need — budget, features, use case — and watch AI match the best products as you type.
            </p>
          </div>
          <div className="searchWrapper">
            <SearchBar
              onSearch={handleSearch}
              onLiveChange={handleLiveChange}
              isLoading={isStreaming}
            />
          </div>
        </section>

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div className="errorBanner" id="error-banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="errorClose">✕</button>
          </div>
        )}

        {/* Skeleton before first token arrives */}
        {isStreaming && !streamingRaw && <LoadingState />}

        {/* AI explanation panel */}
        {((isStreaming && streamingRaw) || finalResult) && (
          <AIResultsPanel
            streamingRaw={streamingRaw}
            finalResult={finalResult}
            isStreaming={isStreaming}
            query={query}
          />
        )}

        {/* ── Products ──────────────────────────────────────────────── */}
        {(!isStreaming || streamingRaw) && (
          <section className="productsSection">

            {/* ── AI mode: recommended only ──────────────── */}
            {hasAIResults && (
              <>
                <div className="sectionHeader">
                  <h2 className="sectionTitle">
                    {isStreaming && liveRecommendedIds.length === 0
                      ? "Finding matches…"
                      : `${recommendedProducts.length} match${recommendedProducts.length !== 1 ? "es" : ""} found`}
                  </h2>
                  {recommendedProducts.length > 0 && (
                    <span className="productCount">{recommendedProducts.length} items</span>
                  )}
                </div>

                {/* Scanning bar while waiting for first IDs */}
                {isStreaming && liveRecommendedIds.length === 0 && (
                  <div className="streamingWait" id="streaming-wait">
                    <div className="streamingPulse" />
                    <span>Scanning catalogue…</span>
                  </div>
                )}

                {/* Recommended grid — ONLY these products */}
                {recommendedProducts.length > 0 && (
                  <>
                    <div className="sectionDivider">
                      <span className="sectionDividerLabel">
                        ✦ Top Picks for You
                        {isStreaming && <span className="liveChip">live</span>}
                      </span>
                    </div>
                    <div className="productsGrid">
                      {recommendedProducts.map((p, idx) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          isRecommended
                          rank={idx + 1}
                          reasoning={finalResult?.reasoning?.[idx]}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* No matches after stream finishes */}
                {!isStreaming && finalResult && recommendedProducts.length === 0 && (
                  <div className="emptyState" id="empty-state">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c8bfb5" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <p>No products matched your request. Try a different description.</p>
                  </div>
                )}
              </>
            )}

            {/* ── Browse mode: all products (no AI) ─────── */}
            {!hasAIResults && (
              <>
                <div className="sectionHeader">
                  <h2 className="sectionTitle">
                    {selectedCategory === "All" ? "All Products" : selectedCategory}
                  </h2>
                  <span className="productCount">{browsableProducts.length} items</span>
                </div>

                <div className="productsGrid">
                  {browsableProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>

                {browsableProducts.length === 0 && (
                  <div className="emptyState" id="empty-state">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c8bfb5" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <p>No products in this category.</p>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
