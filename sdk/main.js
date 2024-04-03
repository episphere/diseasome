import localforage from 'https://cdn.skypack.dev/localforage';

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});
let pgs = localforage.createInstance({
    name: "pgs",
    storeName: "scoreFiles",
})

let fetchAll = localforage.createInstance({
    name: "fetchAll",
    storeName: "urls"
})
let openSnpDbUrls = localforage.createInstance({
    name: "openSnpDbUrls",
    storeName: "userUrls"
})
let openSnpDbUsers = localforage.createInstance({
    name: "openSnpDbUsers",
    storeName: "usersTxt"
})
let functions = {}

// 23andMe ///////////////////////////////////////////////////////////////////////////////////
// get all users with genotype data (23andMe, illumina, ancestry etc)-------------------------------
functions.getUsers = async function() { // opensnp user data includes ancestry, familtyTree, and 23and me genotype data
    const newLocal = 'usersFull';
    let dt
    dt = await openSnpDbUrls.getItem(newLocal); // check for users in localstorage
    if (dt == null) {
        let url = 'https://corsproxy.io/?https://opensnp.org/users.json'
        let users = (await (await fetch(url)).json())
        let dt2 = users.sort((a, b) => a.id - b.id)
        
        dt = openSnpDbUrls.setItem('usersFull', dt2)
    }
    return dt
}

// filter users without 23andme/ancestry data---------------------------------------------------------
functions.filterUsers = async function(type, users) {
    let arr = []

        users.filter(row => row.genotypes.length > 0).map(dt => {

            // keep user with one or more 23andme files
            dt.genotypes.map(i => {
                if (dt.genotypes.length > 0 && i.filetype == type) {
                    let innerObj = {};
                    innerObj["name"] = dt["name"];
                    innerObj["id"] = dt["id"];
                    innerObj["genotype.id"] = i.id;
                    innerObj["genotype.filetype"] = i.filetype;
                    innerObj["genotype.download_url"] = i.download_url.replace("http", "https")
                    arr.push(innerObj)
                }
            })
        })
    return arr
}


functions.get23 = async function(urls) {
    let arr23Txts = []
    for (let i = 0; i < urls.length; i++) {
        let user = await openSnpDbUsers.getItem(urls[i]);

        if (user == null) {
            let url2 = 'https://corsproxy.io/?' + urls[i]
            user = (await (await fetch(url2)).text())
            openSnpDbUsers.setItem(urls[i], user);
        }
        if (user.substring(0, 37) == '# This data file generated by 23andMe') {
            //console.log("This is a valid 23andMe file:", user.substring(0, 37))
            let parsedUser = await parse23(user, urls[i])
            arr23Txts.push(parsedUser)
        } else {
            console.log("ERROR:This is NOT a valid 23andMe file:", user.substring(0, 37))
        }
    }
    return arr23Txts
}
// FUNCTIONS------------------------------------------------------------------------
 functions.downloadBlob = function(content, filename, contentType) {
    // Create a blob
    var jsonse = JSON.stringify(content)
    var blob = new Blob([jsonse], {
        type: contentType
    });
    var url = URL.createObjectURL(blob);

    // Create a link to download it
    var pom = document.createElement('a');
    pom.href = url;
    pom.setAttribute('download', filename);
    pom.click();
}

// make download buttons under plots
 functions.createButton = function(parent,buttonId, buttonTxt, dt) {
    const button = document.createElement("button");
    button.textContent = buttonTxt;
    button.id = buttonId
    document.getElementById(parent).appendChild(button)
    document.getElementById(buttonId).replaceWith(button)

    button.addEventListener("click", function() {
      functions.downloadBlob(dt, 'export.txt', "application/json")
  });
}
functions.createButton2 = function(parent,buttonId, buttonTxt) {
    const button = document.createElement("button");
    button.textContent = buttonTxt;
    button.id = buttonId
    document.getElementById(parent).appendChild(button)
    document.getElementById(buttonId).replaceWith(button)
}

// get all data from API without limits--------------------------------------------
functions.fetchAll2 = async function(url, maxPolls = null) {
    var spinner = document.getElementById("spinner");
    spinner.style.display = "block";
    const allResults = []
    const counts = (await (await (fetch(url))).json())
    if (maxPolls == null) maxPolls = Infinity

    // loop throught the pgs catalog API to get all files using "offset"
    for (let i = 0; i < Math.ceil(counts.count / 100); i++) { //4; i++) { //maxPolls; i++) {
        let offset = i * 100
        let queryUrl = `${url}?limit=100&offset=${offset}`

        // get trait files and scoring files from indexDB if the exist
        let cachedData = await fetchAll.getItem(queryUrl);

        // cach url and data 
        if (cachedData !== null) {
            allResults.push(cachedData)
        } else if (cachedData == null) {
            let notCachedData = (await (await fetch(queryUrl)).json()).results
            fetchAll.setItem(queryUrl, notCachedData);
            allResults.push(notCachedData)
        }
        if (allResults.length > 40) {
            break
        }
    }
    spinner.style.display = "none";
    return allResults
}

// remove local storage api requests that didnt go through--------------------
functions.removeLocalStorageValues = async function(target, dbName) {
    let i = await dbName.length();
    while (i-- > 0) {
        let key = await dbName.key(i);

        if ((await dbName.getItem(key)).message != undefined) { //.includes(target)) {
            dbName.removeItem(key);
            console.log("removeLocalStorageValues with failed requests (limits)", i)
        }
    }
}

// get pgsids for all 17 traits ------------------------------------------------
functions.traitsData = async function(traits) {
    let dt
    if ((await pgs.getItem("traitsData")) === null) {

        dt = traits.map(trait => {
            let traitFilesArr = []
            let pgsIds = []

            traitFiles.map(tfile => {
                if (trait.includes(tfile["trait_categories"][0])) {
                    traitFilesArr.push(tfile)
                }
            })
            if (traitFilesArr.length != 0) {
                pgsIds.push(traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().filter((v, i) => traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().indexOf(v) == i))
            }
            let pgsIds2 = pgsIds.flatMap(x => x)

            let obj = {}
            obj["trait"] = trait
            obj["count"] = pgsIds2.length
            obj["pgsIds"] = pgsIds2
            obj["traitFiles"] = traitFilesArr
            return obj
        })
        pgs.setItem("traitsData", dt)

    } else if (await pgs.getItem("traitsData") != null) {
        dt = await pgs.getItem("traitsData")
    }
    return dt
}
//--------------------------------------
functions.getAllPgsIdsByCategory = function(trait) {
    let traitFilesArr = []
    let pgsIds = []
    // get trait files that match selected trait from drop down
    traitFiles.map(tfile => {
        if (trait.includes(tfile["trait_categories"][0])) {
            traitFilesArr.push(tfile)
        }
    })
    if (traitFilesArr.length != 0) {
        pgsIds.push(traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().filter((v, i) => traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().indexOf(v) == i))
    }
    return pgsIds.flatMap(x => x)

}
//--------------------------------------
functions.timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//------------------------------------
functions.getscoreFiles = async function(pgsIds) {
    var scores = []
    let i = 0
    while (i < pgsIds.length) {
        let url = `https://www.pgscatalog.org/rest/score/${pgsIds[i]}`
        let cachedData = await pgs.getItem(url);
        if (cachedData !== null) {
            scores.push(cachedData)
        } else if (cachedData == null) {
            console.log(i, "No cached data found for ", `${pgsIds[i]}`)
            await functions.timeout(200); // pgs has 100 queries per minute limit
            let notCachedData =
                await (fetch(url)).then(function (response) {
                    return response.json()
                })
                .then(function (response) {
                    return response
                }).catch(function (ex) {
                    console.log("There has been an error: ", ex)
                })
            pgs.setItem(url, notCachedData);
            scores.push(notCachedData)
        }
        i += 1
    }
    return scores
}


const traitFiles = (await functions.fetchAll2('https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
functions.removeLocalStorageValues('request', pgs)

export {
    functions
}