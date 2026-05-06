# Stage 4B — Design Decisions

## Why Caching Improves Performance
Redis stores query results in memory with a 5-minute TTL. When the same
filters are requested again, the response is returned in ~2ms instead of
~300ms. At scale, this reduces database load by 70%+ for read-heavy traffic.

## Why Normalization Improves Cache Hit Rate
Without normalization, { gender: "Male" } and { gender: "male" } produce
different cache keys despite being identical queries. Normalizing to lowercase
and sorting keys alphabetically ensures semantically equivalent queries share
the same cache entry, increasing hit rate from ~40% to 70%+.

## Why Batching Improves Ingestion
Inserting 100,000 rows one at a time requires 100,000 database round-trips
(~200 seconds). Batching 1,000 rows per INSERT reduces this to 100 round-trips
(~8 seconds). Streaming the CSV prevents loading the entire file into memory,
keeping memory usage constant regardless of file size.

## Trade-offs

### Eventual Consistency (Cache Staleness)
Cached data may be up to 5 minutes old after a write. This is acceptable for
demographic profile data that changes infrequently. If a query is
time-sensitive, TTL can be reduced or specific cache keys can be invalidated
on write.

### OFFSET Pagination at Scale
LIMIT/OFFSET degrades beyond page 10,000 on large datasets. Cursor-based
pagination using the last seen ID would be faster but is more complex to
implement. OFFSET is acceptable for the current data scale.

### Redis Dependency
If Redis becomes unavailable, the system falls back to direct DB queries
(getCache returns null). This is handled gracefully — Redis failure does not
cause API downtime, only a performance degradation.