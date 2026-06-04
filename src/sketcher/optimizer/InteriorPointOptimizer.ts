// The interior-point solver now has a SINGLE canonical implementation in
// core/ipopt. This module re-exports it so the sketcher's per-curve-type Problem
// classes keep importing from here unchanged (boundary rule 3: sketcher may use
// core/). The previous ~1170-line copy here was exactly core/ipopt's dense path;
// core/ipopt is a superset (adds the IP_LOCALITY / IP_SPARSE_SOC sparse
// optimizations behind flags, bit-equivalent — locked by ipoptSparseEquivalence
// in core). The sketcher's Problem classes satisfy core/ipopt's OptimizationProblem
// structurally (identical interface; Matrix = number[][] in both).
export { InteriorPointOptimizer } from '../../core/ipopt/InteriorPointOptimizer'
