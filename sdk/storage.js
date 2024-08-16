

const storage = {}
import localforage from 'https://cdn.skypack.dev/localforage';

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});


// get all data from API without limits--------------------------------------------
storage.fetchAll = async function(newTable,url, maxPolls = null) {
    newTable = localforage.createInstance({
        name: newTable,
        storeName: newTable
    })
    const allResults = []
    const counts = (await (await (fetch(url))).json())
    if (maxPolls == null) maxPolls = Infinity

    // loop throught the pgs catalog API to get all files using "offset"
    for (let i = 0; i < Math.ceil(counts.count / 100); i++) { //4; i++) { //maxPolls; i++) {
        let offset = i * 100
        let queryUrl = `${url}?limit=100&offset=${offset}`

        // get trait files and scoring files from indexDB if the exist
        let cachedData = await newTable.getItem(queryUrl);

        // cach url and data 
        if (cachedData !== null) {
            allResults.push(cachedData)
        } else if (cachedData == null) {
      
            let notCachedData = (await (await fetch(queryUrl)).json()).results
            newTable.setItem(queryUrl, notCachedData);
            allResults.push(notCachedData)
        }
        if (allResults.length > 40) {
            break
        }
    }
    return allResults
}

// empty local forage table if it gets too large using max number of keys
storage.clearTableUsingKeyLength = function(table,maxKeys){
    console.log("clearTableUsingKeyLength, maxKeys:",maxKeys )

    if( table.length() > maxKeys){
        table.clear()
        .then(() => {
            console.log('LocalForage cleared!');
        })
        .catch(err => {
            console.error('Error clearing localForage:', err);
        });
    }
}
// delete half irrelevant keys, but not the keys in keep keyList
storage.clearTableButKeepKeyList = async function (table, keepKeys) {
    console.log("table keys:",await table.keys())
    console.log("keepKeys",keepKeys)
    const notKeepKeys  = (await table.keys()).filter(x => !keepKeys.includes(x))
    const deleteKeyList = notKeepKeys.slice(0, Math.ceil(notKeepKeys.length / 2))

    console.log("deleteKeyList",deleteKeyList)
    deleteKeyList.map(x => userTxts.removeItem(x))
}

// estimate the size of localForage data
storage.getLocalForageTableSize = async function (tableName) {
    console.log("---------------------------")
    console.log("running... getLocalForageTableSize function")
    let totalSize = 0;
    let i = 0
    await tableName.iterate((value, key) => {
        i+=1
        console.log(i,"key",key)
        const stringifiedValue = JSON.stringify(value);
        totalSize += stringifiedValue.length * 2; // Approximate size in bytes
    });
    const gbs = bytesToGB(totalSize)
    console.log("localforage ", tableName._config.name, "table size:", gbs.toFixed(3), "GBs")
    return gbs;
}

storage.bytesToGB = function (bytes) {
    return bytes / Math.pow(1024, 3);
}

export {storage}