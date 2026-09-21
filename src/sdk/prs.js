function Match2(mypgs, my23){
  // Defensive checks
  if (!mypgs || !mypgs.cols || !Array.isArray(mypgs.cols)) {
    console.error("Match2 error: invalid mypgs structure", mypgs);
    return { pgs_id: mypgs && mypgs.meta && mypgs.meta.pgs_id, PRS: null, error: "Invalid PGS data structure" };
  }
  if (!my23 || !my23.cols || !Array.isArray(my23.cols)) {
    console.error("Match2 error: invalid my23 structure", my23);
    return { pgs_id: mypgs && mypgs.meta && mypgs.meta.pgs_id, PRS: null, error: "Invalid genome data structure" };
  }
	
  let data2 = {}
  // extract harmonized data from PGS entry first
  const indChr = mypgs.cols.indexOf('hm_chr')
  const indPos = mypgs.cols.indexOf('hm_pos')
  const indOther_allele = mypgs.cols.indexOf('other_allele')
  const indEffect_allele = mypgs.cols.indexOf('effect_allele')
  const indGenotype = my23.cols.indexOf('genotype')
	// match
	let dtMatch = []
	const n = mypgs.dt.length
		for (let i=0; i<n; i++){
			let matchFloor = 0
			  let r = mypgs.dt[i]
			//also filter 23 and me variants if they don't match pgs alt or effect allele 
			let regexPattern = new RegExp([r[indEffect_allele], r[indOther_allele]].join('|'))
  
			if (dtMatch.length > 0) {
				matchFloor = dtMatch.at(-1)[0][4]
			}
		   // console.log("dtmacch i",r, my23.dt.filter(myr => (myr[2] == r[indPos])))
			let dtMatch_i = my23.dt.filter(myr => (myr[2] == r[indPos]))
			   .filter(myr => (myr[1] == r[indChr]))
			// remove 23 variants that don't match pgs effect or other allele    
			   .filter(myr => regexPattern.test(myr[indGenotype])) 
    
			if (dtMatch_i.length > 0) {
				dtMatch.push(dtMatch_i.concat([r]))
			}
		} 
			data2.pgsMatchMy23 = dtMatch
			let calcRiskScore = []
			let alleles = []
			// calculate Risk
			let logR = 0
			// log(0)=1
			let ind_effect_weight = mypgs.cols.indexOf('effect_weight')
			dtMatch.forEach((m, i) => {
				calcRiskScore[i] = 0
				// default no risk
				alleles[i] = 0
				// default no alele
				let mi = m[0][3].match(/^[ACGT]{2}$/)
				// we'll only consider duplets in the 23adme report
				if (mi) {
					//'effect_allele', 'other_allele', 'effect_weight'
					mi = mi[0]
					// 23andme match
					let pi = m.at(-1)
					//pgs match
					let alele = pi[indEffect_allele]
					let L = mi.match(RegExp(alele, 'g'))
					// how many, 0,1, or 2
					if (L) {
						L = L.length
						calcRiskScore[i] = L * pi[ind_effect_weight]
						alleles[i] = L
					}
				}
			})
			data2.pgs_id = mypgs.meta.pgs_id
			data2.alleles = alleles
			data2.calcRiskScore = calcRiskScore
			// Weight type comes from the scoring file metadata only; it is never inferred
			// from the magnitude or sign of the weights. "NR" = not reported.
			data2.weightType = mypgs.meta?.weight_type ?? "NR"
			// PRS_i = sum_j G_ij * w_j on the scale of the original model (no exponentiation,
			// no normalization, unmatched variants simply omitted).
			data2.PRS = dtMatch.length > 0 ? calcRiskScore.reduce((a, b) => a + b, 0) : null
			const weight_idx = mypgs.cols.indexOf('effect_weight')
			const absWeight = (w) => { const n = Number(w); return Number.isFinite(n) ? Math.abs(n) : 0 }
			const totalAbsWeight = mypgs.dt.reduce((s, row) => s + absWeight(row[weight_idx]), 0)
			const matchedAbsWeight = dtMatch.reduce((s, m) => s + absWeight(m.at(-1)[weight_idx]), 0)
			data2.totalVariants = mypgs.dt.length
			data2.matchedVariants = dtMatch.length
			data2.unmatchedVariants = mypgs.dt.length - dtMatch.length
			data2.matchPercent = mypgs.dt.length > 0 ? (dtMatch.length / mypgs.dt.length) * 100 : null
			// Fraction of the model's total absolute effect weight represented by matched variants.
			data2.weightCoverage = totalAbsWeight > 0 ? matchedAbsWeight / totalAbsWeight : null
  
  return data2
  }
  
function MatchOptimized(mypgs, my23) {
  // Defensive checks
  if (!mypgs || !mypgs.cols || !Array.isArray(mypgs.cols)) {
    console.error("MatchOptimized error: invalid mypgs structure", mypgs);
    return { pgs_id: mypgs && mypgs.meta && mypgs.meta.pgs_id, PRS: null, error: "Invalid PGS data structure" };
  }
  if (!my23 || !my23.cols || !Array.isArray(my23.cols)) {
    console.error("MatchOptimized error: invalid my23 structure", my23);
    return { pgs_id: mypgs && mypgs.meta && mypgs.meta.pgs_id, PRS: null, error: "Invalid genome data structure" };
  }

  const indChr = mypgs.cols.indexOf('hm_chr');
  const indPos = mypgs.cols.indexOf('hm_pos');
  const indOtherAllele = mypgs.cols.indexOf('other_allele');
  const indEffectAllele = mypgs.cols.indexOf('effect_allele');
  const indEffectWeight = mypgs.cols.indexOf('effect_weight');

  const ind23Chr = my23.cols.indexOf('chromosome') !== -1 ? my23.cols.indexOf('chromosome') : 1;
  const ind23Pos = my23.cols.indexOf('position') !== -1 ? my23.cols.indexOf('position') : 2;
  const ind23Genotype = my23.cols.indexOf('genotype');
  const ind23Rsid = my23.cols.indexOf('rsid') !== -1 ? my23.cols.indexOf('rsid') : 0;

  let data2 = {};
  let dtMatch = [];
  // Parallel to dtMatch: 'allele' when the genotype carries the effect or other allele,
  // 'position' when only chr:pos lined up. Position-only entries always score 0 alleles.
  let matchType = [];

  const isCalledDuplet = (g) => typeof g === 'string' && /^[ACGT]{2}$/.test(g);
  const isRsProbe = (id) => typeof id === 'string' && /^rs/i.test(id);
  // Order-insensitive genotype key: "AG" and "GA" are the same unordered diploid call.
  const genotypeKey = (g) => g.split('').sort().join('');

  // Resolve duplicate probes at a single locus with deterministic precedence rather
  // than a first-encountered rule:
  //   1. called ACGT duplets beat no-calls ("--", "II", haploid calls),
  //   2. rsID-labeled probes beat vendor-internal `i`-probes,
  //   3. surviving candidates must agree on the (unordered) genotype; disagreement is
  //      an unresolved conflict and the locus is treated as missing.
  // Ties are broken by lexicographic probe id so the representative row is stable
  // regardless of file order. Returns { row, status } with status
  // 'called' | 'noCall' | 'conflict'.
  const resolveLocusRows = (rows) => {
    if (rows.length === 1) {
      return { row: rows[0], status: isCalledDuplet(rows[0][ind23Genotype]) ? 'called' : 'noCall' };
    }
    const byId = (a, b) => String(a[ind23Rsid]).localeCompare(String(b[ind23Rsid]));
    const called = rows.filter(r => isCalledDuplet(r[ind23Genotype]));
    if (called.length === 0) {
      // No probe produced a usable call: the locus cannot contribute to direct
      // scoring; keep a representative row (rsID preferred) for accounting.
      const rep = [...rows].sort(byId).find(r => isRsProbe(r[ind23Rsid])) || [...rows].sort(byId)[0];
      return { row: rep, status: 'noCall' };
    }
    const rsCalled = called.filter(r => isRsProbe(r[ind23Rsid]));
    const candidates = (rsCalled.length > 0 ? rsCalled : called).sort(byId);
    const genotypes = new Set(candidates.map(r => genotypeKey(String(r[ind23Genotype]))));
    return { row: candidates[0], status: genotypes.size > 1 ? 'conflict' : 'called' };
  };

  // Build a lookup index once: key = "chr:pos" -> all genome rows at that locus.
  const genomeIndex = new Map();
  const genomeRowCount = Array.isArray(my23.dt) ? my23.dt.length : 0;
  for (const row of my23.dt) {
    const key = `${row[ind23Chr]}:${row[ind23Pos]}`;
    if (!genomeIndex.has(key)) {
      //console.log(`Adding new key to genomeIndex: ${key}`);
      genomeIndex.set(key, []);
    }
    genomeIndex.get(key).push(row);
  }
  // Collapse each locus to a single deterministically resolved probe row.
  for (const [key, rows] of genomeIndex) {
    genomeIndex.set(key, resolveLocusRows(rows));
  }

  // For each PGS row, do O(1) key lookup against the resolved locus.
  const pgsRowCount = Array.isArray(mypgs.dt) ? mypgs.dt.length : 0;
  // Reasons a model variant never contributes to the score.
  let positionAbsent = 0;      // locus not present in the genome file
  let noCall = 0;              // locus genotyped but no probe produced an ACGT duplet ("--", "II", haploid)
  let genotypeConflict = 0;    // duplicate probes disagree after precedence rules; treated as missing
  let alleleIncompatible = 0;  // valid call, but it carries neither the effect nor the other allele
  for (let i = 0; i < pgsRowCount; i++) {
    const r = mypgs.dt[i];
    const key = `${r[indChr]}:${r[indPos]}`;
    const resolved = genomeIndex.get(key);
    if (!resolved) { positionAbsent++; continue; }
    const { row: locusRow, status } = resolved;

    // Keep position-only matches as well: the locus was genotyped, but the call carries
    // neither the effect nor the other allele (strand flip, no-call "--", indel, third
    // allele) or the duplicate probes conflict. Dropping them hid genotyped loci that
    // legitimately contribute 0 alleles.
    let isAlleleMatch = false;
    if (status === 'called') {
      const regexPattern = new RegExp([r[indEffectAllele], r[indOtherAllele]].join('|'));
      isAlleleMatch = regexPattern.test(locusRow[ind23Genotype]);
      if (!isAlleleMatch) alleleIncompatible++;
    } else if (status === 'conflict') {
      genotypeConflict++;
    } else {
      noCall++;
    }
    dtMatch.push([locusRow, r]);
    matchType.push(isAlleleMatch ? 'allele' : 'position');
  }

  data2.pgsMatchMy23 = dtMatch;
  data2.matchType = matchType;
  data2.alleleMatchCount = matchType.filter(t => t === 'allele').length;
  data2.positionOnlyCount = matchType.length - data2.alleleMatchCount;

  let calcRiskScore = [];
  let alleles = [];

  dtMatch.forEach((m, i) => {
    calcRiskScore[i] = 0;
    alleles[i] = 0;

    // Only allele-level matches score; position-only entries (no-call, unresolved
    // duplicate-probe conflict, incompatible alleles) contribute a dosage of 0.
    if (matchType[i] !== 'allele') return;

    const genotype = m[0]?.[ind23Genotype];
    let mi = typeof genotype === 'string' ? genotype.match(/^[ACGT]{2}$/) : null;

    if (mi) {
      mi = mi[0];
      const pi = m.at(-1);
      const allele = pi[indEffectAllele];
      let L = mi.match(RegExp(allele, 'g'));
      if (L) {
        L = L.length;
        calcRiskScore[i] = L * pi[indEffectWeight];
        alleles[i] = L;
      }
    }
  });

  data2.pgs_id = mypgs.meta?.pgs_id;
  data2.alleles = alleles;
  data2.calcRiskScore = calcRiskScore;

  // Weight type is carried through as model metadata (PGS Catalog `#weight_type=`).
  // It is never inferred from the magnitude or the sign of the weights; "NR" means the
  // scoring file did not report one.
  data2.weightType = mypgs.meta?.weight_type ?? "NR";

  // Score on the scale defined by the original PGS model:
  //   PRS_i = sum_j G_ij * w_j   over matched variants j
  // G in {0,1,2} is the effect-allele dosage and w is the reported `effect_weight`.
  // No exponentiation is applied, the score is not normalized against a population
  // reference, and unmatched variants are simply omitted from the summation (no
  // reference-allele or mean-dosage substitution).
  const scoreSum = calcRiskScore.reduce((a, b) => a + b, 0);
  data2.PRS = data2.alleleMatchCount > 0 ? scoreSum : null;

  // Per sample-model accounting.
  const absWeight = (w) => { const n = Number(w); return Number.isFinite(n) ? Math.abs(n) : 0; };
  const totalAbsWeight = mypgs.dt.reduce((s, row) => s + absWeight(row[indEffectWeight]), 0);
  const matchedAbsWeight = dtMatch.reduce((s, m, i) =>
    matchType[i] === 'allele' ? s + absWeight(m.at(-1)[indEffectWeight]) : s, 0);

  data2.totalVariants = pgsRowCount;
  data2.matchedVariants = data2.alleleMatchCount;
  data2.unmatchedVariants = pgsRowCount - data2.alleleMatchCount;
  // Unresolved duplicate-probe conflicts are treated as missing genotypes: they
  // cannot contribute to direct scoring, reducing recoverable model coverage.
  data2.missingGenotypes = positionAbsent + noCall + genotypeConflict;
  data2.unmatchedReasons = { positionAbsent, noCall, genotypeConflict, alleleIncompatible };
  data2.matchPercent = pgsRowCount > 0 ? (data2.alleleMatchCount / pgsRowCount) * 100 : null;
  // Fraction of the model's total absolute effect weight represented by matched variants.
  data2.weightCoverage = totalAbsWeight > 0 ? matchedAbsWeight / totalAbsWeight : null;

  data2.complexity = {
    bigO: 'O(n + m)',
    hashIndexOps: genomeRowCount + pgsRowCount,
    nestedScanOps: genomeRowCount * pgsRowCount,
    genomeRows: genomeRowCount,
    pgsRows: pgsRowCount
  };

  return data2;
}


export {
	Match2,
	MatchOptimized
}
