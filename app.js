const ENTITY_FILES = {
    'US': { filename: 'us.json', name: 'USA' },
    'UK': { filename: 'uk.json', name: 'United Kingdom' },
    'SG': { filename: 'sg.json', name: 'Singapore' },
    'EU': { filename: 'eu.json', name: 'EU (Netherlands & Germany)' },
    'JP': { filename: 'jp.json', name: 'Japan' },
    'CA': { filename: 'ca.json', name: 'Canada' },
    'AU': { filename: 'au.json', name: 'Australia' }
};

let currentPricingData = null; 
let instanceLookup = {}; 
let storagePricing = null; 
let bandwidthTiers = []; 
let currentQuote = []; 
const bandwidthItemId = 'GLOBAL_BANDWIDTH'; 
const BASELINE_STORAGE_GB = 5; 

// --- Quote Calculation and Rendering ---

function updateQuoteTotal() {
    let total = 0;
    currentQuote.forEach(item => {
        total += item.subtotal;
    });

    const currency = currentPricingData ? currentPricingData.currency : '';
    const formattedTotal = formatPrice(total, currency, 2);

    document.getElementById('quoteTotal').textContent = formattedTotal;
    document.getElementById('quoteCurrency').textContent = currency;
}

function renderQuoteItems() {
    const quoteItemsBody = document.getElementById('quoteItems');
    quoteItemsBody.innerHTML = '';
    
    const currency = currentPricingData ? currentPricingData.currency : '';
    const exportButton = document.getElementById('exportButton');
    
    if (currentQuote.length === 0) {
        quoteItemsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Your quote is empty. Add an instance configuration above!</td></tr>';
        exportButton.disabled = true; // Disable export if empty
    } else {
        exportButton.disabled = false; // Enable export if items exist
    }

    currentQuote.forEach((item, index) => {
        const row = quoteItemsBody.insertRow();
        
        row.innerHTML = `
            <td>${item.quantity_display || item.quantity}</td>
            <td>${item.item_type}</td>
            <td>${item.description}</td>
            <td class="quote-price-col">${formatPrice(item.price_per_unit, currency, item.price_decimals)}</td>
            <td class="quote-price-col">${formatPrice(item.subtotal, currency, 2)}</td>
            <td><button style="background-color: #f0ad4e; color: #fff;" onclick="removeItem(${index})">Remove</button></td>
        `;
    });

    updateQuoteTotal();
}

function removeItem(index) {
    currentQuote.splice(index, 1);
    renderQuoteItems();
}

function calculateBandwidthCost(totalTB) {
    if (totalTB <= 1) return 0; 

    let cost = 0;
    let totalChargedTB = totalTB - 1;
    let volumeToCharge = totalChargedTB;
    
    const sortedTiers = [...bandwidthTiers]
        .filter(t => t.threshold_tb > 0)
        .sort((a, b) => a.threshold_tb - b.threshold_tb);
    
    for (let i = 0; i < sortedTiers.length; i++) {
        const currentTier = sortedTiers[i];
        const nextTier = sortedTiers[i + 1];
        
        const tierStart = currentTier.threshold_tb; 
        const tierEnd = nextTier ? nextTier.threshold_tb : Infinity; 
        
        const capacityAtThisTier = tierEnd - tierStart; 
        
        let volumeInThisTier = Math.min(volumeToCharge, capacityAtThisTier);
        
        if (volumeInThisTier > 0) {
            cost += volumeInThisTier * currentTier.price_per_tb;
            volumeToCharge -= volumeInThisTier;
        }

        if (volumeToCharge <= 0) break;
    }

    return cost;
}

function updateBandwidthInQuote() {
    const bandwidthInput = document.getElementById('bandwidthInput');

    if (document.getElementById('updateBandwidthButton').disabled) {
        alert("Please set a region first.");
        return;
    }

    const totalBandwidthTB = parseFloat(bandwidthInput.value);

    if (isNaN(totalBandwidthTB) || totalBandwidthTB < 0) {
        alert("Please enter a valid Total Estimated Bandwidth (in TB).");
        return;
    }

    const bandwidthCost = calculateBandwidthCost(totalBandwidthTB);
    
    // 1. Remove any previous bandwidth item
    currentQuote = currentQuote.filter(item => item.item_id !== bandwidthItemId);

    // 2. Add/Update the new bandwidth item
    if (bandwidthCost > 0 || totalBandwidthTB > 0) { 
        currentQuote.push({
            item_id: bandwidthItemId,
            item_type: 'Bandwidth',
            quantity: totalBandwidthTB, 
            quantity_display: `${totalBandwidthTB.toFixed(2)} TB`,
            price_per_unit: bandwidthCost, 
            subtotal: bandwidthCost,
            price_decimals: 2,
            description: `Total Outgoing Traffic (Charged Volume: ${(Math.max(0, totalBandwidthTB - 1)).toFixed(2)} TB)`,
        });
    }

    renderQuoteItems();
}

// --- EXPORT FUNCTION ---
function exportQuoteToCSV() {
    if (currentQuote.length === 0) {
        alert("The quote is empty. Please add items before exporting.");
        return;
    }

    const currency = currentPricingData ? currentPricingData.currency : 'N/A';
    // Get the formatted total from the HTML element
    const totalElement = document.getElementById('quoteTotal').textContent;

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Header Row
    csvContent += "Qty,Item / Type,Description,Price / Unit,Subtotal\n";

    // Item Rows
    currentQuote.forEach(item => {
        const qty = item.quantity_display || item.quantity;
        const pricePerUnit = item.price_per_unit.toFixed(item.price_decimals);
        const subtotal = item.subtotal.toFixed(2);
        
        // Escape quotes and wrap values in quotes to handle commas in description
        const description = item.description.replace(/"/g, '""');
        
        csvContent += `"${qty}","${item.item_type}","${description}","${pricePerUnit}","${subtotal}"\n`;
    });

    // Total Row (using the formatted total for accuracy)
    csvContent += `\n,,,TOTAL MONTHLY COST,"${totalElement}"\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // Use the region code and date for the filename
    link.setAttribute("download", `cloud_quote_${currentPricingData.entity}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// --- END EXPORT FUNCTION ---


function addToQuote() {
    const selectedInstanceType = document.getElementById('instanceSelect').value;
    const quantityInput = document.getElementById('instanceQuantity');
    const storageType = document.querySelector('input[name="storageType"]:checked').value;
    const storageCapacity = document.getElementById('storageCapacity');
    
    if (document.getElementById('entitySelect').disabled === false || !selectedInstanceType) {
        alert("Please click 'Set Region' and select an instance type first.");
        return;
    }

    const quantity = parseInt(quantityInput.value, 10);
    const totalStorageGB = parseInt(storageCapacity.value, 10);
    

    if (isNaN(quantity) || quantity <= 0) {
        alert("Please enter a valid Instance Quantity (integer) greater than 0.");
        return;
    }
    if (isNaN(totalStorageGB) || totalStorageGB < BASELINE_STORAGE_GB) {
         alert(`Please enter a valid Total Capacity (GB, integer) of at least ${BASELINE_STORAGE_GB} GB.`);
        return;
    }
    
    // --- 1. Add Instance Cost ---
    const instance = instanceLookup[selectedInstanceType];
    const instancePricePerMonth = instance.Price_per_month;
    const vCPU = instance.vCPU;

    currentQuote.push({
        item_id: `INSTANCE_${selectedInstanceType}_${Date.now()}`, 
        item_type: 'Instance',
        quantity: quantity,
        price_per_unit: instancePricePerMonth,
        subtotal: instancePricePerMonth * quantity,
        price_decimals: 2,
        description: `${selectedInstanceType} (${instance.series}) - ${vCPU} vCPU / ${instance.Memory_GiB} GiB RAM / ${totalStorageGB} GB ${storageType} Storage`,
    });

    // --- 2. Add Storage Cost ---
    let chargeableStorageGB = 0;
  //  if (storageType === 'Network') {
        chargeableStorageGB = Math.max(0, totalStorageGB - BASELINE_STORAGE_GB); 
//    }
    
    if (chargeableStorageGB > 0) {
        
        if (!storagePricing || !storagePricing.Price_per_GB_Month) {
             alert("Error: Network Storage pricing data is missing for this region.");
             return;
        }

        const storagePricePerGBMonth = storagePricing.Price_per_GB_Month;
        const totalStoragePrice = storagePricePerGBMonth * chargeableStorageGB * quantity;
        
        currentQuote.push({
            item_id: `STORAGE_${selectedInstanceType}_${Date.now()}`, 
            item_type: 'Storage',
            quantity: chargeableStorageGB * quantity, 
            quantity_display: `${chargeableStorageGB} GB/instance x ${quantity}`,
            price_per_unit: storagePricePerGBMonth,
            subtotal: totalStoragePrice,
            price_decimals: 4,
            description: `Network Storage (Charged: ${chargeableStorageGB} GB/instance)`,
        });
    }
    
    renderQuoteItems();
    
    // --- Reset Configuration ---
    quantityInput.value = 1;
    document.getElementById('storageLocal').checked = true; 
    toggleStorageInputs(); 
    document.getElementById('instanceSelect').value = ''; 
    displaySelectedSpecs({ target: document.getElementById('instanceSelect') }); 
}

// --- UI Control Functions ---

function toggleStorageInputs() {
    const isNetworkSelected = document.getElementById('storageNetwork').checked;
    const storageCapacityInput = document.getElementById('storageCapacity');
    const storageNote = document.getElementById('storageNote');
    
    storageCapacityInput.disabled = false;
    
    if (isNetworkSelected) {
        storageCapacityInput.value = BASELINE_STORAGE_GB; 
        storageCapacityInput.min = BASELINE_STORAGE_GB; 
        storageNote.innerHTML = `Network capacity is **chargeable** for volume exceeding ${BASELINE_STORAGE_GB} GB.`;
    } else {
        storageCapacityInput.value = BASELINE_STORAGE_GB; 
        storageCapacityInput.min = BASELINE_STORAGE_GB;
        storageNote.innerHTML = `Capacity is **Local** (included in instance price). Enter desired capacity, minimum **${BASELINE_STORAGE_GB} GB**.`;
    }
}

function setRegion() {
    const regionStatusMessage = document.getElementById('regionStatusMessage');

    document.getElementById('entitySelect').disabled = true;
    document.getElementById('setRegionButton').disabled = true;
    
    document.getElementById('resetButton').disabled = false;
    
    // Enable the instance selection and configuration inputs
    document.getElementById('instanceSelect').disabled = false; 
    document.getElementById('bandwidthInput').disabled = false;
    document.getElementById('instanceQuantity').disabled = false;
    document.getElementById('storageCapacity').disabled = false; 
    
    document.getElementById('storageLocal').disabled = false;
    document.getElementById('storageNetwork').disabled = false;
    document.getElementById('updateBandwidthButton').disabled = false; 
    
    toggleStorageInputs(); 
    
    // Update region lock message (small green font)
    regionStatusMessage.innerHTML = `Region **${currentPricingData.entity} (${currentPricingData.currency})** is now **LOCKED**.`;
    regionStatusMessage.style.color = '#28a745'; 
    
    document.getElementById('specDetails').innerHTML = `<p style="font-weight: bold;">Region Locked. Please select an instance type to begin quoting.</p>`;
}

function resetForm() {
    const entitySelect = document.getElementById('entitySelect');
    const instanceSelect = document.getElementById('instanceSelect');
    const regionStatusMessage = document.getElementById('regionStatusMessage');

    currentQuote = []; 

    entitySelect.disabled = false;
    
    instanceSelect.disabled = true;
    instanceSelect.innerHTML = '<option value="">-- Select a Region First --</option>';
    
    // Disable inputs for instance configuration
    document.getElementById('instanceQuantity').disabled = true;
    document.getElementById('storageCapacity').disabled = true; 
    
    // Disable inputs for bandwidth (independent section)
    document.getElementById('bandwidthInput').disabled = true;
    document.getElementById('updateBandwidthButton').disabled = true;
    
    // Reset radio buttons and notes
    document.getElementById('storageLocal').checked = true;
    document.getElementById('storageLocal').disabled = true;
    document.getElementById('storageNetwork').disabled = true;
    document.getElementById('bandwidthInput').value = 1;
    toggleStorageInputs(); 
    
    // Disable main buttons
    document.getElementById('setRegionButton').disabled = true;
    document.getElementById('resetButton').disabled = true;
    document.getElementById('addToQuoteButton').disabled = true;
    
    // Clear region lock message
    regionStatusMessage.innerHTML = '';
    
    document.getElementById('specDetails').innerHTML = '<p>Please select an instance type to see its technical details and pricing.</p>';
    
    entitySelect.value = 'US';
    handleEntityChange({ target: entitySelect }); 
    renderQuoteItems(); 
}

// --- Data Fetching and Updating ---

function updateErrorMessage(message, isError) {
    const errorDiv = document.getElementById('loadingError');
    if (isError) {
        errorDiv.textContent = `File Error: ${message}`;
        errorDiv.style.display = 'block';
    } else {
        errorDiv.style.display = 'none';
    }
}


async function fetchPricingData(entityKey) {
    const file = ENTITY_FILES[entityKey];
    if (!file) return null;
    
    updateErrorMessage('', false); 

    try {
        const response = await fetch(file.filename);
        if (!response.ok) {
            if (response.status === 404) {
                 throw new Error(`File not found: Please ensure '${file.filename}' is in the same folder as this HTML file.`);
            }
            throw new Error(`HTTP error ${response.status} when fetching ${file.filename}`); 
        }
        const data = await response.json();
        
        // Using central_storage as per JSON file structure
        if (data.entity && data.currency && Array.isArray(data.instance_pricing) && Array.isArray(data.local_nvme_storage) && Array.isArray(data.central_storage) && Array.isArray(data.bandwidth_pricing)) {
             return data;
        }
        
        throw new Error(`Incomplete JSON file: Missing one of the required data sections in ${file.filename}.`); 
    } catch (error) {
        console.error('Error fetching data:', error);
        updateErrorMessage(error.message, true);
        return null;
    }
}

async function handleEntityChange(e) {
    const selectedKey = e.target.value;
    const instanceSelect = document.getElementById('instanceSelect');
    const regionStatusMessage = document.getElementById('regionStatusMessage');

    document.getElementById('setRegionButton').disabled = true; 
    document.getElementById('resetButton').disabled = true;
    document.getElementById('addToQuoteButton').disabled = true;
    
    // Clear region status when selection changes
    regionStatusMessage.innerHTML = ''; 

    const data = await fetchPricingData(selectedKey);
    
    if (data) {
        currentPricingData = data;
        
        document.getElementById('setRegionButton').disabled = false; 
        document.getElementById('resetButton').disabled = false;
        
        populateInstanceDropdown(data.instance_pricing);
        // Using central_storage as per JSON file structure
        storagePricing = data.central_storage.length > 0 ? data.central_storage[0] : null; 
        bandwidthTiers = data.bandwidth_pricing; 
        
        // Update region status message with loaded info (small blue font)
        regionStatusMessage.innerHTML = `Pricing data loaded for **${data.entity} (${data.currency})**. Click **"Set Region"** to lock and configure.`;
        regionStatusMessage.style.color = '#0073e6'; 
        
        document.getElementById('specDetails').innerHTML = `<p style="font-weight: bold;">Region pricing loaded. Click **"Set Region"** above to proceed.</p>`;
    } else {
        instanceSelect.disabled = true;
        instanceSelect.innerHTML = '<option value="">-- Error Loading Data --</option>';
        document.getElementById('specDetails').innerHTML = `<p style="font-weight: bold; color:red;">Data load failed. Please fix the error above or select a different region.</p>`;
    }
    document.getElementById('quoteCurrency').textContent = currentPricingData ? currentPricingData.currency : '';
    updateQuoteTotal();
}

function populateInstanceDropdown(instancePricing) {
    const instanceSelect = document.getElementById('instanceSelect');
    instanceSelect.innerHTML = '<option value="">-- Select Instance Type --</option>'; 
    instanceLookup = {};

    instancePricing.forEach(instance => {
        const key = instance.instance_type;
        instanceLookup[key] = instance; 
        
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${key} (Series: ${instance.series})`;
        instanceSelect.appendChild(option);
    });
}


// --- Rendering and Formatting Helper ---

function formatPrice(price, currency, decimals) {
    
    let priceString;
    if (currency === 'JPY' && decimals < 4) {
        // JPY special case: round to nearest integer and use 0 decimals
        priceString = Math.round(price).toFixed(0);
    } else {
        // All other currencies/cases use specified decimals
        priceString = price.toFixed(decimals);
    }
    
    // 1. Split into integer and fractional parts using the decimal point
    const parts = priceString.split('.');
    let integerPart = parts[0];
    // Re-add the decimal point for the fractional part if it exists
    const fractionalPart = parts.length > 1 ? '.' + parts[1] : ''; 
    
    // 2. Apply thousand separator ONLY to the integer part
    // This ensures no commas appear after the decimal point
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    // 3. Rejoin and prepend currency
    return `${currency}${integerPart}${fractionalPart}`;
}

function displaySelectedSpecs(e) {
    const selectedInstanceType = e.target.value;
    const specDetailsContainer = document.getElementById('specDetails');
    const addToQuoteButton = document.getElementById('addToQuoteButton');
    
    if (selectedInstanceType) {
        addToQuoteButton.disabled = false;
    } else {
        addToQuoteButton.disabled = true;
    }


    if (!selectedInstanceType) {
        specDetailsContainer.innerHTML = '<p>Please select an instance type to see its technical details and pricing.</p>';
        return;
    }

    const instance = instanceLookup[selectedInstanceType];
    const { currency } = currentPricingData;

    // Use 4 decimals for hourly price (more precision is common)
    const hourlyPrice = formatPrice(instance.Price_per_hour, currency, 4); 
    // Use 2 decimals for monthly price
    const monthlyPrice = formatPrice(instance.Price_per_month, currency, 2); 
    
    const vCPUValue = `${instance.vCPU} vCPUs`; 

    // --- 1. Construct the single-line specification string ---
    const specificationLine = [
        `Series: ${instance.series}`,
        vCPUValue,
        `${instance.Memory_GiB} GiB RAM`,
        `Baseline: ${instance.Baseline_bandwidth}`,
        `Burst: ${instance.Burst_bandwidth}`,
        `Private: ${instance.Private_network}`
    ].join(' &middot; '); // Using the middle dot as a separator

    // --- 2. Construct the HTML for the card ---
    let html = '';
    
    // Single line for specifications
    html += `<p style="font-size: 0.9em; font-weight: 500; border-bottom: 1px dashed #c0e0f5; padding-bottom: 5px;">${specificationLine}</p>`;
    
    // Combined line for pricing
    html += `<div class="spec-item">
                <span class="spec-label">Pricing:</span>
                <span class="spec-value" style="font-weight: bold; font-size: 1.1em;">
                    ${hourlyPrice} / hr &middot; ${monthlyPrice} / mo
                </span>
             </div>`;
    
    specDetailsContainer.innerHTML = html;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const entitySelect = document.getElementById('entitySelect');
    
    document.getElementById('resetButton').disabled = true;
    document.getElementById('storageCapacity').disabled = true;
    document.getElementById('instanceQuantity').disabled = true;
    document.getElementById('bandwidthInput').disabled = true;
    document.getElementById('updateBandwidthButton').disabled = true;
    document.getElementById('storageCapacity').value = BASELINE_STORAGE_GB; 
    document.getElementById('exportButton').disabled = true; 

    // 1. Populate the Entity dropdown
    for (const key in ENTITY_FILES) {
        const file = ENTITY_FILES[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = file.name;
        entitySelect.appendChild(option);
    }
    
    // 2. Attach Event Listeners
    entitySelect.addEventListener('change', handleEntityChange);
    document.getElementById('instanceSelect').addEventListener('change', displaySelectedSpecs);
    document.getElementById('storageTypeRadios').addEventListener('change', toggleStorageInputs);

    // 3. Initial load of the default entity (US)
    if (entitySelect.options.length > 0) {
        entitySelect.value = 'US'; 
        handleEntityChange({ target: entitySelect });
    }
    
    // Initial quote render
    renderQuoteItems();

});




