# Summary: Attention Is All You Need (Transformers)

## Overview
This paper introduces the Transformer, a neural network architecture for
sequence transduction that relies entirely on attention mechanisms, dispensing
with recurrence and convolutions. It was a departure from the RNN- and
LSTM-based encoder-decoder models that dominated machine translation.

## Key idea: self-attention
Self-attention relates different positions of a single sequence to compute a
representation of that sequence. For each token, the model computes query, key,
and value vectors; attention weights come from the scaled dot-product of queries
and keys. Because every position attends to every other position directly, the
path length between distant tokens is constant, which makes long-range
dependencies easier to learn than in recurrent models.

## Multi-head attention
Rather than a single attention function, the Transformer uses multiple attention
"heads" in parallel, each projecting into a lower-dimensional space. This lets
the model attend to information from different representation subspaces at once.

## Positional encoding
Since the model has no recurrence, it adds sinusoidal positional encodings to
the input embeddings so the model can use the order of the sequence.

## Why it mattered
Transformers are highly parallelizable and train faster than recurrent models on
modern hardware. The architecture became the foundation for later large language
models.
