# Summary: Approximate Nearest Neighbor Search in Vector Databases

## Problem
Semantic search represents text as high-dimensional embedding vectors and finds
the items closest to a query vector. Exact nearest-neighbor search compares the
query against every stored vector, which is O(n) per query and becomes too slow
as collections grow into the millions.

## HNSW
Hierarchical Navigable Small World (HNSW) graphs are a popular approximate
index. They build a multi-layer graph where upper layers have long-range links
for fast traversal and lower layers are dense. Search greedily hops toward the
query, giving high recall with logarithmic-like query time. HNSW needs no
training step but uses more memory and has slower inserts than flat indexes.

## IVFFlat
Inverted File with Flat compression (IVFFlat) partitions vectors into clusters
("lists") using k-means. A query is compared only against vectors in the nearest
few lists. IVFFlat is lighter on memory and faster to build than HNSW, but it
must be trained on representative data first and generally yields lower recall.

## Distance metrics
Cosine similarity is the most common metric for text embeddings because it
compares direction and ignores magnitude. L2 (Euclidean) and inner product are
also supported by most vector databases and may be preferred depending on how
the embedding model was trained.

## Practical guidance
For most retrieval-augmented generation workloads, HNSW with cosine distance is
a strong default. IVFFlat is attractive when memory is constrained and the data
set is large and stable.
