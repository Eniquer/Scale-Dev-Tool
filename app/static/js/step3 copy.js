let items = [];
let subdimensions = [];
let testjason = [
    
        {
            "items": "Item 1",
            "sub1": "",
            "sub2": 4
        },
        {
            "id": 2,
            "content": "Item 2",
            "rating": 5
        },
        {
            "id": 3,
            "content": "Item 3",
            "rating": 3
        },
    
        {
            "id": 4,
            "content": "Item 4",
            "rating": 2
        },
        {
            "id": 5,
            "content": "Item 5",
            "rating": 4
        },
        {
            "id": 6,
            "content": "Item 6",
            "rating": 5
        }
    
];


async function init(){
    const step1Data = await window.dataStorage.getData('data_step_1');
    const step2Data = await window.dataStorage.getData('data_step_2');
    const step3Data = await window.dataStorage.getData('data_step_3') || {};
    subdimensions = step1Data?.panel5?.subdimensions || [];
    items = step2Data.items || [];

    displayTable(getTableStructure(), "#item-rating-table", 0);

}

function getTableStructure(){
    results = [];
    items.forEach(item => {
        let tmp = {"item": item.id + ". " + item.text}
        subdimensions.forEach(sub => {
                tmp[sub.name] = ""
        });
        results.push(tmp)
    });
    return results;
}