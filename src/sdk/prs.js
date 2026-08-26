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

  let data2 = {};
  let dtMatch = [];
  // Parallel to dtMatch: 'allele' when the genotype carries the effect or other allele,
  // 'position' when only chr:pos lined up. Position-only entries always score 0 alleles.
  let matchType = [];

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

  // For each PGS row, do O(1) key lookup and filter only local candidates.
  const pgsRowCount = Array.isArray(mypgs.dt) ? mypgs.dt.length : 0;
  // Reasons a model variant never contributes to the score.
  let positionAbsent = 0;      // locus not present in the genome file
  let noCall = 0;              // locus genotyped but the call is not an ACGT duplet ("--", "II", haploid)
  let alleleIncompatible = 0;  // valid call, but it carries neither the effect nor the other allele
  for (let i = 0; i < pgsRowCount; i++) {
    const r = mypgs.dt[i];
    const key = `${r[indChr]}:${r[indPos]}`;
    // console.log(`Processing PGS row ${i} at locus ${key}:`, r);
    const locusRows = genomeIndex.get(key) || [];
    // console.log("locusRows = genomeIndex.get(key) || [];",locusRows)
    if (locusRows.length === 0) { positionAbsent++; continue; }

    const regexPattern = new RegExp([r[indEffectAllele], r[indOtherAllele]].join('|'));
    const alleleRows = locusRows.filter(myr => regexPattern.test(myr[ind23Genotype]));
    // Keep position-only matches as well: the locus was genotyped, but the call carries
    // neither the effect nor the other allele (strand flip, no-call "--", indel, third
    // allele). Dropping them hid genotyped loci that legitimately contribute 0 alleles.
    const isAlleleMatch = alleleRows.length > 0;
    if (!isAlleleMatch) {
      const called = locusRows.some(myr => /^[ACGT]{2}$/.test(String(myr[ind23Genotype])));
      if (called) alleleIncompatible++; else noCall++;
    }
    dtMatch.push((isAlleleMatch ? alleleRows : locusRows).concat([r]));
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
  data2.missingGenotypes = positionAbsent + noCall;
  data2.unmatchedReasons = { positionAbsent, noCall, alleleIncompatible };
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
