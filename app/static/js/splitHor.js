window.initSplit = function initializeSplit() {
if (document.getElementById('area1') && document.getElementById('area2')) {
    const splitInstance = Split(['#area1', '#area2'], {
        direction: 'vertical',
        sizes: [50, 50],      // start 50% / 50%
        minSize: [100, 0],         // px minimum
        gutterSize: 4,
        cursor: 'row-resize',
        onDragStart: () => {
        if (document.getElementById("json-table")) {
            document.getElementById("json-table").style.height = document.getElementById("json-table").getClientRects()[0].height + "px"
        }
        if (document.getElementById("area2").getBoundingClientRect().height < 1) {
            document.getElementById("area2").classList.remove("expand");
            splitInstance.setSizes([80, 20]);
        }
    },
    onDragEnd: () => {
        if (document.getElementById("json-table")) {
            document.getElementById("json-table").style.height = "100%"; // Reset width to 100% after resizing
        }
        if (document.getElementById("area2").getBoundingClientRect().height < 1) {
            document.getElementById("area2").classList.add("expand");
        }
    }
    });
    // Add click handler to toggle expand/collapse
    document.getElementById("expand-area2").addEventListener("click", function()
    {
        const area2 = document.getElementById("area2");
        if (area2.classList.contains("expand")) {
            area2.classList.remove("expand");
            splitInstance.setSizes([80, 20]); // Adjust sizes when collapsing
        } 
    });

}}

