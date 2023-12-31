import { plotly} from "../dependencies.js";
import { PGS23} from "../main.js";
import localforage from 'https://cdn.skypack.dev/localforage';

console.log("---------------------")

console.log("allTraits.js loaded")

let allTraits = {dt: []}

const dbName = "localforage"
localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});

// let allTraitsDb = localforage.createInstance({
//     name: dbName,
//     storeName: "PGS_Catalog"
// })

let allTraitsDb = localforage.createInstance({
    name: "allTraitsDb",
    storeName: "traitFiles"
})



allTraits.dt.traits = []
allTraits.dt.traitFiles = (await fetchAll2('https://www.pgscatalog.org/rest/trait/all')).flatMap(x=>x)
//allTraits.dt.traitFiles2 = (await fetchAll2('https://www.pgscatalog.org/rest/trait/all'))
//allTraits.dt.scoringFiles = (await fetchAll2('https://corsproxy.io/?https://www.pgscatalog.org/rest/score/all')).flatMap(x=>x)
// pgs ids for all traits for overview allTraits
let traits = Array.from(new Set(allTraits.dt.traitFiles.flatMap(x => x["trait_categories"])
.sort().filter(e => e.length).map(JSON.stringify)), JSON.parse)

traits.map( x =>  getAllPgsIds(x))



async function fetchAll2(url, maxPolls = null) {

    var spinner = document.getElementById("spinner");
    spinner.style.display = "block";
    const allResults = []
    const counts = (await (await(fetch(url))).json())
    if (maxPolls == null) maxPolls = Infinity

// loop throught the pgs catalog API to get all files using "offset"
    for (let i = 0; i < Math.ceil( counts.count/100) ; i++) {  //4; i++) { //maxPolls; i++) {
        let offset = i * 100
        let queryUrl = `${url}?limit=100&offset=${offset}`

        // get trait files and scoring files from indexDB if the exist
        let cachedData = await allTraitsDb.getItem(queryUrl);

        // cach url and data 
        if  (cachedData !== null){
            allResults.push(cachedData)
           
        } else if (cachedData == null) {
            let notCachedData = (await (await fetch(queryUrl)).json()).results

            allTraitsDb.setItem(queryUrl, notCachedData);
            allResults.push(notCachedData)
        }

        if (allResults.length > 40) {
            break
        }     
}
spinner.style.display = "none";
return allResults
}



async function preferredOrder(obj, order) {
    var newObject = {};
    for (var i = 0; i < order.length; i++) {
        if (obj.hasOwnProperty(order[i])) {
            newObject[order[i]] = obj[order[i]];
            //console.log(obj[order[i]])
        }
    }
    return newObject;
}


function getAllPgsIds(trait) {
    let traitFilesArr = []
    let pgsIds = []
    // get trait files that match selected trait from drop down
    allTraits.dt.traitFiles.map(tfile => {
        if (trait.includes(tfile["trait_categories"][0])) {
            traitFilesArr.push(tfile)
        }
    })
    if (traitFilesArr.length != 0) {
        pgsIds.push( traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().filter((v, i) => traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().indexOf(v) == i))
    }
    let pgsIds2 = pgsIds.flatMap(x=> x)

    let obj = {}
    obj["trait"] = trait
    obj["count"] = pgsIds2.length
    obj["pgsIds"] = pgsIds2
    obj["traitFiles"] = traitFilesArr
    allTraits.dt.traits.push(obj)
}


allTraits.pgsCounts = async function () {

    let allTraitsDt = (allTraits.dt.traits).sort(function (a, b) {return a.count - b.count});

    let div = document.getElementById("pgsBar")
    var layout = {
        autosize: true,
        title: 'Counts of PGS Catalog Scoring Files by Trait',
        margin: {
            l: 150,
            r: 10,
            t: -10,
            b: -10
        }
    }
    var dt = [{
  
        x: allTraitsDt.map(x => x.count),
        y: allTraitsDt.map(x => x.trait),
        type: 'bar',
        orientation: 'h'
    }]
    plotly.newPlot(div, dt, layout);
}

allTraits.pgsCounts()



allTraits.plotAllMatchByEffect4 = async function (data, errorDiv, dv) {
    //https://community.allTraitsly.com/t/fill-shade-a-chart-above-a-specific-y-value-in-allTraitslyjs/5133

    const obj = {}
    const indChr = data.pgs.cols.indexOf('hm_chr')
    const indPos = data.pgs.cols.indexOf('hm_pos')
    const indBeta = data.pgs.cols.indexOf('effect_weight')
    // QC to check when two or more 23andMe variants mapped to pgs variant

    errorDiv.innerHTML = ''
    let duplicate = ''

    const matched = data.pgsMatchMy23.map(function (v) {
        //console.log("data.pgsMatchMy23",v)
        if (v.length == 2) {
            return v[1]

        } else if (v.length == 3) {
            console.log("two 23andme SNPS mapped to one pgs variant", v)
            duplicate += `<span style="font-size:small; color: red">Warning : two 23andMe variants mapped to pgs variant : chr.position ${v[2][indChr]+"."+v[2][indPos]}<br>Only the first 23andMe variant is used: ${v[0]}</span><br>`
            errorDiv.innerHTML = duplicate
            return v[2]
        } else if (v.length > 3) {
            duplicate += `<span style="font-size:small; color: red">Warning : more than two 23andMe variants mapped to a pgs variant<br>please check 23andMe file for duplicate chromosome.position</span><br>`
            errorDiv.innerHTML = duplicate
            console.log("more than 2 23andme SNPS mapped to one pgs variant", v)
            return v[2]
        }
    })
    // separate pgs.dt into 2 (matches and non matches) arrays and then sort by effect  
    // " matched" data

    const matched_risk = matched.map((j) => {
        return j[indBeta]
    })

    const matched_chrPos = matched.map(j => {
        return `Chr${j[indChr]}.${j[indPos]}`
    })
    obj['matched'] = {}
    obj.matched.chrPos = matched_chrPos
    obj.matched.dt = matched
    obj.matched.alleles = data.alleles
    obj.matched.risk = matched_risk
    obj.matched.category = Array(matched.length).fill("matched")

    //     // NON-MATCHED --------------------------------------------------------------------------------------------
    const notMatchData = data.pgs.dt.filter(element => !matched.includes(element)); // "not matched" data

    // sort by effect
    let not_matched_idx = [...Array(notMatchData.length)]
        .map((_, i) => i).sort((a, b) => (notMatchData[a][4] - notMatchData[b][4])) //match indexes
    const not_matched = not_matched_idx.map(j => {
        let xi = notMatchData[j]
        return xi
    })
    const not_matched_chrPos = not_matched.map(j => {
        return `Chr${j[indChr]}.${j[indPos]}`
    })

    const not_matched_risk = not_matched.map((yi, i) => yi[indBeta])

    obj['not_matched'] = {}
    obj.not_matched.chrPos = not_matched_chrPos
    obj.not_matched.dt = not_matched
    obj.not_matched.risk = not_matched_risk
    const fill_no_match = `${not_matched.length} not matched`
    obj.not_matched.category = Array(not_matched.length).fill(fill_no_match)
    obj.not_matched.size = Array(not_matched.length).fill("9")
    obj.not_matched.color = Array(not_matched.length).fill("rgb(140, 140, 140)")
    obj.not_matched.opacity = Array(not_matched.length).fill("0.5")
    obj.not_matched.symbol = Array(not_matched.length).fill("x")
    obj.not_matched.hoverinfo = Array(not_matched.length).fill("all")
    // ALL VARIANTS -------------------------------------------------------------------------------------
    const allData = data.pgs.dt

    let allData_idx = [...Array(allData.length)].map((_, i) => i).sort((a, b) => (allData[a][4] - allData[b][4])) //match indexes
    const allData_sorted = allData_idx.map(j => {
        let xi = allData[j]
        return xi
    })
    const allData_chrPos = allData.map(j => {
        return `Chr${j[indChr]}.${j[indPos]}`
    })

    const allData_risk = allData.map((yi, i) => yi[indBeta])

    obj['all'] = {}
    obj.all.chrPos = allData_chrPos
    obj.all.dt = allData_sorted
    obj.all.risk = allData_risk
    obj.all.category = Array(allData_sorted.length).fill(" ")
    obj.all.size = Array(allData_sorted.length).fill("10")
    obj.all.color = Array(allData_sorted.length).fill("green")
    obj.all.opacity = Array(allData_sorted.length).fill("0")
    obj.all.symbol = Array(allData_sorted.length).fill("square")
    obj.all.hoverinfo = Array(allData_sorted.length).fill("none")
    // MATCHED BY alleles---------------------------
    // separate data.pgsMatchMy23 into 3 (dosage #) arrays

    //https://stackoverflow.com/questions/40415231/how-to-get-an-array-of-values-based-on-an-array-of-indexes
    const zero_allele = matched.filter((ele, idx) => data.alleles[idx] == 0);
    const zero_allele_idx = data.alleles.map((elm, idx) => elm == 0 ? idx : '')
        .filter(String);
    const one_allele = matched.filter((ele, idx) => data.alleles[idx] == 1);
    const one_allele_idx = data.alleles.map((elm, idx) => elm == 1 ? idx : '')
        .filter(String);
    const two_allele = matched.filter((ele, idx) => data.alleles[idx] == 2);
    const two_allele_idx = data.alleles.map((elm, idx) => elm == 2 ? idx : '')
        .filter(String);

    // x (chr pos)  y (betas or betas*dosage) allTraits data
    const zero_allele_chrpos = zero_allele_idx.map(i => `Chr${matched[i][indChr]}.${matched[i][indPos]}`)
    const one_allele_chrpos = one_allele_idx.map(i => `Chr${matched[i][indChr]}.${matched[i][indPos]}`)
    const two_allele_chrpos = two_allele_idx.map(i => `Chr${matched[i][indChr]}.${matched[i][indPos]}`)

    obj['matched_by_alleles'] = {}
    obj.matched_by_alleles.zero_allele = {}
    obj.matched_by_alleles.one_allele = {}
    obj.matched_by_alleles.two_allele = {}

    obj.matched_by_alleles.zero_allele.chrPos = zero_allele_chrpos
    obj.matched_by_alleles.one_allele.chrPos = one_allele_chrpos
    obj.matched_by_alleles.two_allele.chrPos = two_allele_chrpos
    obj.matched_by_alleles.zero_allele.dt = zero_allele
    obj.matched_by_alleles.one_allele.dt = one_allele
    obj.matched_by_alleles.two_allele.dt = two_allele
    obj.matched_by_alleles.zero_allele.risk = zero_allele_idx.map(i => matched[i][indBeta]);
    obj.matched_by_alleles.one_allele.risk = one_allele_idx.map(i => matched[i][indBeta]);
    obj.matched_by_alleles.two_allele.risk = two_allele_idx.map(i => matched[i][indBeta]);
    obj.matched_by_alleles.zero_allele.category = Array(zero_allele.length).fill(`${zero_allele.length } matched, zero alleles`)
    obj.matched_by_alleles.one_allele.category = Array(one_allele.length).fill(`${one_allele.length } matched, one allele`)
    obj.matched_by_alleles.two_allele.category = Array(two_allele.length).fill(`${two_allele.length } matched, two alleles`)
    obj.matched_by_alleles.zero_allele.size = Array(zero_allele.length).fill("8")
    obj.matched_by_alleles.one_allele.size = Array(one_allele.length).fill("8")
    obj.matched_by_alleles.two_allele.size = Array(two_allele.length).fill("10")
    obj.matched_by_alleles.zero_allele.color = Array(zero_allele.length).fill("#17becf")
    obj.matched_by_alleles.one_allele.color = Array(one_allele.length).fill("navy")
    obj.matched_by_alleles.two_allele.color = Array(two_allele.length).fill("#d62728")
    obj.matched_by_alleles.zero_allele.opacity = Array(zero_allele.length).fill("1")
    obj.matched_by_alleles.one_allele.opacity = Array(one_allele.length).fill("1")
    obj.matched_by_alleles.two_allele.opacity = Array(two_allele.length).fill("1")
    obj.matched_by_alleles.zero_allele.symbol = Array(zero_allele.length).fill("0")
    obj.matched_by_alleles.one_allele.symbol = Array(one_allele.length).fill("diamond")
    obj.matched_by_alleles.two_allele.symbol = Array(two_allele.length).fill("square")
    obj.matched_by_alleles.zero_allele.symbol = Array(zero_allele.length).fill("0")
    obj.matched_by_alleles.one_allele.symbol = Array(one_allele.length).fill("diamond")
    obj.matched_by_alleles.two_allele.symbol = Array(two_allele.length).fill("square")
    obj.matched_by_alleles.zero_allele.hoverinfo = Array(zero_allele.length).fill("all")
    obj.matched_by_alleles.one_allele.hoverinfo = Array(one_allele.length).fill("all")
    obj.matched_by_alleles.two_allele.hoverinfo = Array(two_allele.length).fill("all")


    // add matched,all, zero, one and two allele into new array
    //https://stackoverflow.com/questions/64055094/push-multiple-arrays-with-keys-into-single-array
    function Push(data, subdata) {
        return subdata.map((_, i) => {
            return Object.entries(data).reduce((a, [k, arr]) => (a[k] = arr[i], a), {})
        })
    }
    const items = Push(obj.all, obj.all.risk).concat(
        Push(obj.not_matched, obj.not_matched.risk)).concat(
        Push(obj.matched_by_alleles.zero_allele, obj.matched_by_alleles.zero_allele.risk)).concat(
        Push(obj.matched_by_alleles.one_allele, obj.matched_by_alleles.one_allele.risk)).concat(
        Push(obj.matched_by_alleles.two_allele, obj.matched_by_alleles.two_allele.risk))

    plotRiskDiv.style.height = 20 + data.pgs.dt.length * 1.1 + 'em'
    plotAllMatchByEffectDiv.style.height = 20 + data.pgs.dt.length * 1.1 + 'em'

    // make new objects with id, all mapped to one condition sorted by value
    const cache = []
    const chooseData = [" ", `${zero_allele.length } matched, zero alleles`, `${one_allele.length } matched, one allele`, `${two_allele.length } matched, two alleles`, `${not_matched.length} not matched`]

    const allTraitsData = items
        .filter(function (item) {
            if (chooseData.indexOf(item.category) === -1) {
                cache.push(item);
                return false;
            } else {
                return true;
            }
        })
        .sort((a, b) => parseFloat(a.risk) - parseFloat(b.risk))

    // re-order allTraits legend manually, order conditions list by regex 
    const conditions_arr = Array.from(new Set(allTraitsData.map(a => a.category)))

    var rx_not = new RegExp(/\bnot?(?!S)/);
    var rx_zero = new RegExp(/\bzero?(?!S)/);
    var rx_one = new RegExp(/\bone?(?!S)/);
    var rx_two = new RegExp(/\btwo?(?!S)/);

    function getSortingKey(value) {
        if (rx_not.test(value)) {
            return 2
        }
        if (rx_zero.test(value)) {
            return 3
        }
        if (rx_one.test(value)) {
            return 4
        }
        if (rx_two.test(value)) {
            return 5
        }
        return 1;
    }
    const conditions = conditions_arr.sort(function (x, y) {
        return getSortingKey(x) - getSortingKey(y);
    });
    const traces = [];
    conditions.forEach(function (category) {
        var newArray = allTraitsData.filter(function (el) {
            return el.category == category;
        });
        traces.push({
            y: newArray.map(a => a.chrPos),
            x: newArray.map(a => a.risk),
            name: category,
            hoverinfo: newArray[0].hoverinfo,
            mode: 'markers',
            type: 'scatter',
            opacity: newArray[0].opacity,
            marker: {
                color: newArray[0].color,
                symbol: newArray[0].symbol,
                size: newArray[0].size,
            }
        })
    })


    var layout = {
        title: {
            text: `<span >PGS#${data.pgs.meta.pgs_id.replace(/^.*0+/,'')}: β's for ${data.pgs.dt.length} ${data.pgs.meta.trait_mapped} variants, PRS ${Math.round(data.PRS*1000)/1000}</span>`,
            font: {
                size: 19
            }
        },
        margin: {
            l: 140,
        },

        showlegend: true,
        legend: {
            orientation: 'v',
            font: {
                size: 16
            }
        },
        yaxis: {
            // remove white space at top and bottom of y axis caused by using "markers"
            range: [-1, data.pgs.dt.length],
            showgrid: true,
            showline: true,
            mirror: 'ticks',
            gridcolor: '#bdbdbd',
            gridwidth: 1,
            linecolor: '#636363',
            title: {
                text: '<span style="font-size:large">Chromosome and Position</span>',
                font: {
                    size: 24
                },
                standoff: 10
            },
            tickfont: {
                size: 10.5
            },
        },
        xaxis: {
            font: {
                size: 18
            },
            tickfont: {
                size: 16
            },
            title: '<span style="font-size:large">β</span>',
            linewidth: 1,
            mirror: true,
        }
    }

    dv.innerHTML = ''

    var config = {
        responsive: true
    }
    data.allTraits = obj
    data.allTraits.traces = traces

    plotly.newPlot(dv, traces, layout, config)
    tabulateAllMatchByEffect(PGS23.data, document.getElementById('tabulateAllMatchByEffectDiv'))
}

/* allTraits percent of matched and not matched betas */
async function tabulateAllMatchByEffect(data, div) {

    if (!div) {
        div = document.createElement('div')
        document.body.appendChild(div)
    }
    div.innerHTML = `<span style="font-size:x-large">PRS = exp( ∑ (𝛽*z)) = ${Math.round(data.PRS*1000)/1000}</span><br><hr><div>Table for ${data.allTraits.matched_by_alleles.one_allele.dt.length + data.allTraits.matched_by_alleles.two_allele.dt.length} matched PGS variants (dosage = 1 or 2)</div><hr>`
    // sort by absolute value
    let jj = [...Array(data.calcRiskScore.length)].map((_, i) => i) // match indexes
    // remove zero effect
    jj = jj.filter(x => data.calcRiskScore[x] != 0)
    jj.sort((a, b) => (data.calcRiskScore[b] - data.calcRiskScore[a])) // indexes sorted by absolute value

    // tabulate
    let tb = document.createElement('table')
    div.appendChild(tb)
    let thead = document.createElement('thead')
    tb.appendChild(thead)
    thead.innerHTML = `<tr><th align="left">#</th><th>β</th><th align="left">z</th><th align="right"> β*z</th><th align="center">variant</th><th align="center">dbSNP</th><th align="left">SNPedia </th></tr>`
    let tbody = document.createElement('tbody')
    tb.appendChild(tbody)
    const indChr = data.pgs.cols.indexOf('hm_chr')
    const indPos = data.pgs.cols.indexOf('hm_pos')

    let indOther_allele = data.pgs.cols.indexOf('other_allele')
    if (indOther_allele == -1) {
        indOther_allele = data.pgs.cols.indexOf('hm_inferOtherAllele')
    }
    const indEffect_allele = data.pgs.cols.indexOf('effect_allele')
    const indEffect_weight = data.pgs.cols.indexOf('effect_weight')

    let n = jj.length

    jj.forEach((ind, i) => {
        //let jnd=n-ind

        let row = document.createElement('tr')
        tbody.appendChild(row)

        let xi = data.pgsMatchMy23[ind]
        let my_23idx = 1
        if (xi.length > 2) {
            my_23idx = 2
        }
        row.innerHTML = `<tr><td align="left">${i+1})</td><td align="center">${Math.round(xi[my_23idx][indEffect_weight]*1000)/1000}</td><td align="center">${data.alleles[ind]}</td><td align="left">${Math.round(data.calcRiskScore[ind]*1000)/1000}</td><td align="left" style="font-size:small;color:darkgreen"><a href="https://myvariant.info/v1/variant/chr${xi.at(-1)[indChr]}:g.${xi.at(-1)[indPos]}${xi.at(-1)[indOther_allele]}>${xi.at(-1)[indEffect_allele]}" target="_blank">Chr${xi.at(-1)[indChr]}.${xi.at(-1)[indPos]}:g.${xi.at(-1)[indOther_allele]}>${xi.at(-1)[indEffect_allele]}</a></td><td align="left"><a href="https://www.ncbi.nlm.nih.gov/snp/${xi[0][0]}" target="_blank">${xi[0][0]}</a><td align="left"><a href="https://www.snpedia.com/index.php/${xi[0][0]}" target="_blank">  wiki   </a></td></tr>`
    })
}

/* allTraits percent of matched and not matched betas */
allTraits.pieChart = async function (data = PGS23.data) {
    pieChartDiv.style.height = 19 + 'em'

    /* allTraits percent of matched and not matched betas */
    const risk_composition = {}
    const risk1 = data.allTraits.matched.risk.reduce((partialSum, a) => partialSum + a, 0);
    const risk2 = data.allTraits.not_matched.risk.reduce((partialSum, a) => partialSum + a, 0);
    risk_composition[`total β for ${data.allTraits.matched.risk.length} <br>matched variants`] = risk1
    risk_composition[`total β for ${data.allTraits.not_matched.risk.length} <br>unmatched variants`] = risk2
    var y = Object.values(risk_composition)
    var x = Object.keys(risk_composition)
    var pieallTraitsData = [{
        values: y,
        labels: x,
        //showlegend: false,
        insidetextorientation: "horizontal",
        //automargin : "true",
        textinfo: "percent",
        textposition: "inside",
        type: 'pie',
        //automargin: true,
        marker: {
            colors: ["#2ca02c", "grey"],
            size: 19,
            line: {
                color: 'black'
            }
        },
        textfont: {
            color: 'black',
            size: 19
        },

        hoverlabel: {
            bgcolor: 'black',
            bordercolor: 'black',
            font: {
                color: 'white',
                size: 18
            }
        }
    }]
    var layout = {
        title: {
            text: ` PGS#${data.pgs.meta.pgs_id.replace(/^.*0+/,'')}: total β contribution for ${data.pgsMatchMy23.length} matched <br>and ${data.pgs.dt.length-data.pgsMatchMy23.length} unmatched variants`,
            font: {
                size: 19
            }
        },
        width: '20em',
        legend: {
            xanchor: "right",
            font: {
                size: 16
            }
        },
    };
    var config = {
        responsive: true
    }

    plotly.newPlot('pieChartDiv', pieallTraitsData, layout, config);
}
console.log("allTraits",allTraits)

export { allTraits}
