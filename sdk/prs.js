import localforage from 'https://cdn.skypack.dev/localforage';

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});

let prsTable = localforage.createInstance({
    name: "prsTable",
    storeName: "prsTable",
})

let PRS = {}
PRS.Match2 = function (data) {
    let data2 = {}
    data2.users = data.users
    data2.pgs = data.pgs

    //    let snpTxts2 = snpTxts.filter(x=> x.meta.split(/\r?\n|\r|\n/g)[0].slice(-4) > 2010)
    // extract harmonized data from pgs entry first
    const indChr = data.pgs.cols.indexOf('hm_chr')
    const indPos = data.pgs.cols.indexOf('hm_pos')
    const indOther_allele = data.pgs.cols.indexOf('other_allele')
    const indEffect_allele = data.pgs.cols.indexOf('effect_allele')
    const indGenotype = data.users.cols.indexOf('genotype')

    // match
    let dtMatch = []
    const n = data.pgs.dt.length
    for (let i = 0; i < n; i++) {
        let matchFloor = 0
        let r = data.pgs.dt[i]
        //also filter 23 and me variants if they don't match pgs alt or effect allele 
        let regexPattern = new RegExp([r[indEffect_allele], r[indOther_allele]].join('|'))

        if (dtMatch.length > 0) {
            matchFloor = dtMatch.at(-1)[0][4]
        }
        // console.log("dtmacch i",r, data.usersdt.filter(myr => (myr[2] == r[indPos])))
        let dtMatch_i = data.users.dt.filter(myr => (myr[2] == r[indPos]))
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
    let ind_effect_weight = data.pgs.cols.indexOf('effect_weight')
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
    data2.alleles = alleles
    data2.calcRiskScore = calcRiskScore
    let weight_idx = data.pgs.cols.indexOf('effect_weight')
    let weights = data.pgs.dt.map(row => row[weight_idx])
    // warning: no matches found!
    if (calcRiskScore.length == 0) {
        data2.PRS = "there are no matches :-("
        data2.QC = false
        data2.QCtext = 'there are no matches :-('
        //console.log('there are no matches :-(',data.PRS)
    } else if (calcRiskScore.reduce((a, b) => Math.max(a, b)) > 100) { //&&(calcRiskScore.reduce((a,b)=>Math.max(a,b))<=1)){ // hazard ratios?
        data2.PRS = Math.exp(calcRiskScore.reduce((a, b) => a + b))
        data2.QC = false
        data2.QCtext = 'these are large betas :-('
        //console.log('these are large betas :-(',weights)
    } else if (weights.reduce((a, b) => Math.min(a, b)) > -0.00002) {
        data2.PRS = Math.exp(calcRiskScore.reduce((a, b) => a + b))
        data2.QC = false
        data2.QCtext = 'these are not betas :-('
        //console.log('these are not betas :-(',weights) 
    } else {
        data2.PRS = Math.exp(calcRiskScore.reduce((a, b) => a + b))
        data2.QC = true
        data2.QCtext = ''
    }

    return data2
}

// calculate prs for multiple pgs and users ----------------------------

PRS.calc = async function (matrix) {
    console.log("------------------------")
    console.log("Calculating PRS scores!")
    console.log("matrix input data 2:", matrix)

    let arr = []
    const badIds = []
    // todo remove qc from match2 function
    // todo remove users with old chips
    for (let i = 0; i < matrix.users.txts.length; i++) {
        console.log("---------------------------")
        console.log("processing user #...", i)

        for (let j = 0; j < matrix.pgs.txts.length; j++) {

            let input = {
                "pgs": matrix.pgs.txts[j],
                "users": matrix.users.txts[i]
            }
            // console.log("input",input)
            // console.log("pgs:",matrix.pgs[j], "my23:",matrix.users[i])
            let label = matrix.pgs.txts[j].id + "," + matrix.users.txts[i].openSnp.id
            let res = await prsTable.getItem(label)
            // console.log("res", res)
            // check if prs has already been caclulated for this person and pgs entry
            if (await prsTable.getItem(label) == null) {
                res = PRS.Match2(input)
                prsTable.setItem(label, res)
                // console.log("res", res)
            }
            // if(res.QC==true  ){
            arr.push(res)
            console.log("processing pgs model: ", matrix.pgs.txts[j].id)
            // } else if(res.QC==false){
            // badIds.push(matrix.pgs.txts[j].id)
            // }
        }
    }
    const badIds2 = Array.from(new Set([...badIds]))
    console.log("pgs entries that fail PRS (ie. no matches):", badIds2)

    // if prs qc fails for one user, remove the connected pgs entry
    const obj = {}
    obj.users = matrix.users
    // obj.pgs = matrix.pgs.txts.filter(x=>!badIds2.includes(x.id))
    obj.prs = arr //.filter(x=> !badIds.includes(x.pgsId))
    console.log("arr", arr)
    return arr
}
// data object defined here ---

// document.getElementById('prsButton').addEventListener('click', async function(event) {
//     let data = {}
//     data["pgs"] =  output["myPgsTxts"].filter(x => x.qc == "true")
//    // console.log('data pgs length:', data["pgs"].length)
//     data["my23"] = output["my23"]

//     let PRS = PRS_fun(data)
//     data["PRS"] = await PRS
//     console.log("data",data )

//     // Plot PRS
// let prsDiv = document.getElementById("prsDiv")
// var layout = {
//     showlegend: true,
//     autosize: false,
//     height: 700, 
//     width: 700,
//    // title: `OpenSNP phenotypes`,
//     yaxis: {
//         title: {
//             text: "PRS"},
//     },
//     xaxis:{
//         //standoff: 5,
//         title: {
//             text: "openSNP users"},
//     },
//     margin: {b: 400 },

// }

// // reverse look up the PRS matrix to fill the traces
// let traces = {}
// data.pgs.map( (x,i) => {
//     let arr = []
//     let idx = i

//     data.usersmap( y => {
//         arr.push( data.PRS[idx])
//         idx += data.pgs.length
//         })
//         traces[data.PRS[i].pgsId] = arr
//     })
//     console.log(traces)


// let plotData=  Object.keys(traces).map( x =>{
//     console.log("traces[x]",traces[x].map( x => x.userId))

//     console.log("traces[x]",traces[x].map( x => x.openSnp.phenotypes["Type II Diabetes"]["variation"]))

//     let obj = {
//     "y": traces[x].map( x => x.PRS),
//     "x": traces[x].map( x => x.openSnp.phenotypes["Type II Diabetes"]["variation"] + "_" + "ID" +  x.userId + "_" +   x.openSnp.name),
//     mode: 'lines+markers',
//     "opacity": 0.80,
//     "name":x,
//     }
//     return obj
// } )

// plotly.newPlot(prsDiv, plotData, layout);
// })

export {
    PRS
}
