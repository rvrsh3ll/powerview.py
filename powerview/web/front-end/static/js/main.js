document.addEventListener('DOMContentLoaded', () => {
    const footerYear = document.querySelector('#footer-year');
    if (footerYear) {
        footerYear.textContent = currentYear();
    }

    async function initialize() {
        checkConnectionStatus();
        try {
            const domainInfoResponse = await fetch('/api/get/domaininfo', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!domainInfoResponse.ok) {
                throw new Error(`HTTP error! status: ${domainInfoResponse.status}`);
            }

            const domainInfo = await domainInfoResponse.json();
            const rootDn = domainInfo.root_dn;
            const domainName = domainInfo.domain;
            const flatName = domainInfo.flatName;

            const domainSpan = document.querySelector('span#domain-name');
            if (domainSpan) {
                domainSpan.textContent = flatName;
            }

            const distinguishedNames = [
                rootDn,
                `CN=Configuration,${rootDn}`,
                `CN=Schema,CN=Configuration,${rootDn}`,
                `DC=DomainDnsZones,${rootDn}`,
                `DC=ForestDnsZones,${rootDn}`
            ];

            for (const dn of distinguishedNames) {
                const exists = await checkDistinguishedNameExists(dn);
                if (exists) {
                    createTreeNode(dn);
                }
            }
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    }

    async function checkDistinguishedNameExists(identity) {
        try {
            const response = await fetch('/api/get/domainobject', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ searchbase: identity, search_scope: 'BASE' })
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            return data && data.length > 0;
        } catch (error) {
            console.error('Error checking distinguished name:', error);
            return false;
        }
    }

    function createTreeNode(dn) {
        const treeView = document.getElementById('tree-view');
        const div = document.createElement('div');
        div.classList.add('flex', 'items-center', 'gap-1', 'p-1', 'hover:bg-gray-100', 'rounded', 'cursor-pointer');

        const folderIcon = document.createElement('svg');
        folderIcon.classList.add('w-4', 'h-4', 'text-yellow-500');
        folderIcon.setAttribute('fill', 'none');
        folderIcon.setAttribute('stroke', 'currentColor');
        folderIcon.setAttribute('viewBox', '0 0 24 24');
        folderIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        folderIcon.innerHTML = '<path d="M3 7v4a1 1 0 001 1h3m10 0h3a1 1 0 001-1V7m-4 0V5a2 2 0 00-2-2H8a2 2 0 00-2 2v2m0 0h12"></path>';

        div.appendChild(folderIcon);
        div.innerHTML += `<span>${dn}</span>`;

        div.addEventListener('click', async (event) => {
            event.stopPropagation();

            let subtreeContainer = div.nextElementSibling;
            if (subtreeContainer && subtreeContainer.classList.contains('subtree')) {
                subtreeContainer.remove();
                return;
            }

            const itemData = await fetchItemData(dn, 'BASE');
            if (itemData) {
                populateResultsPanel(itemData);
                toggleSubtree(dn, div);
            }
        });

        treeView.appendChild(div);
    }

    async function fetchItemData(identity, search_scope = 'LEVEL') {
        console.log(identity);
        //showLoadingIndicator();
        try {
            const response = await fetch('/api/get/domainobject', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ searchbase: identity, search_scope: search_scope })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data[0];
        } catch (error) {
            console.error('Error fetching item data:', error);
            return null;
        } finally {
            //hideLoadingIndicator();
        }
    }

    async function toggleSubtree(searchbase, parentElement) {
        let subtreeContainer = parentElement.nextElementSibling;
        if (subtreeContainer && subtreeContainer.classList.contains('subtree')) {
            subtreeContainer.remove();
            return; // Exit the function to prevent fetching data again
        }

        try {
            const response = await fetch('/api/get/domainobject', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ searchbase: searchbase, search_scope: 'LEVEL' })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Fetched data:', data); // Log the data to inspect its structure

            if (Array.isArray(data)) {
                displaySubtree(data, parentElement);
            } else if (data && typeof data === 'object') {
                displaySubtree([data], parentElement);
            } else {
                console.error('Unexpected data format:', data);
            }
        } catch (error) {
            console.error('Error fetching subtree:', error);
        }
    }

    function displaySubtree(dataArray, parentElement) {
        const subtreeContainer = document.createElement('div');
        subtreeContainer.classList.add('ml-6', 'subtree');

        dataArray.forEach(obj => {
            const objDiv = document.createElement('div');
            objDiv.classList.add('flex', 'items-center', 'gap-1', 'p-1', 'hover:bg-gray-100', 'rounded', 'cursor-pointer');

            let iconClass = 'fa-folder'; // Default outlined icon
            let iconColorClass = 'text-blue-500'; // Default color for most objects

            if (obj.attributes.objectClass.includes('group')) {
                iconClass = 'fa-users'; // Use fa-users for groups
            } else if (obj.attributes.objectClass.includes('container')) {
                iconClass = 'fa-box'; // Use fa-box-open for containers
                iconColorClass = 'text-yellow-500'; // Yellow for containers
            } else if (obj.attributes.objectClass.includes('computer')) {
                iconClass = 'fa-desktop'; // Use fa-desktop for computers
            } else if (obj.attributes.objectClass.includes('user')) {
                iconClass = 'fa-user-circle'; // Use fa-user-circle for users
            } else if (obj.attributes.objectClass.includes('organizationalUnit')) {
                iconClass = 'fa-building'; // Use fa-building for organizational units
                iconColorClass = 'text-yellow-500'; // Yellow for organizational units
            }

            const icon = document.createElement('i');
            icon.classList.add('fas', iconClass, 'w-4', 'h-4', 'mr-1', iconColorClass);

            objDiv.appendChild(icon);
            objDiv.innerHTML += `<span>${obj.attributes.name || obj.dn}</span>`;

            objDiv.addEventListener('click', async (event) => {
                event.stopPropagation();

                let childSubtreeContainer = objDiv.nextElementSibling;
                if (childSubtreeContainer && childSubtreeContainer.classList.contains('subtree')) {
                    childSubtreeContainer.remove();
                    return; // Exit the function to prevent fetching data again
                }

                const itemData = await fetchItemData(obj.dn, 'BASE', no_loading = true);
                if (itemData) {
                    populateResultsPanel(itemData);
                    toggleSubtree(obj.dn, objDiv);
                }
            });

            subtreeContainer.appendChild(objDiv);
        });

        parentElement.insertAdjacentElement('afterend', subtreeContainer);
    }

    function populateResultsPanel(item) {
        const resultsPanel = document.getElementById("results-panel");
        const attributes = item.attributes;

        let detailsHTML = `
            <div class="bg-gray-50 px-4 py-2 border-b">
                <h3 class="font-medium">${attributes.name || 'Details'}</h3>
            </div>
            <div class="p-4">
                <dl class="grid grid-cols-2 gap-4">
        `;

        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'member' || key === 'memberOf' || key === 'objectCategory' || key === 'distinguishedName') {
                detailsHTML += `
                    <div>
                    <dt class="text-sm font-medium text-gray-500">${key}</dt>
                    <dd class="mt-1 text-sm text-gray-900">
                        ${Array.isArray(value) ? value.map(v => `<a href="#" class="text-blue-400 hover:text-blue-600 ldap-link" data-identity="${v}">${v}</a>`).join('<br>') : `<a href="#" class="text-blue-400 hover:text-blue-600 ldap-link" data-identity="${value}">${value}</a>`}
                        </dd>
                    </div>
                `;
            } else {
                detailsHTML += `
                    <div>
                        <dt class="text-sm font-medium text-gray-500">${key}</dt>
                        <dd class="mt-1 text-sm text-gray-900">${Array.isArray(value) ? value.join('<br>') : value}</dd>
                    </div>
                `;
            }
        }

        detailsHTML += `
                </dl>
            </div>
        `;

        resultsPanel.innerHTML = detailsHTML;

        // Attach event listeners to the new links
        document.querySelectorAll('.ldap-link').forEach(link => {
            link.addEventListener('click', async (event) => {
                event.preventDefault();
                const identity = event.target.dataset.identity;
                const detailsPanel = document.getElementById('details-panel');
                const commandHistoryPanel = document.getElementById('command-history-panel');

                if (detailsPanel.classList.contains('hidden')) {
                    detailsPanel.classList.remove('hidden');
                    commandHistoryPanel.classList.add('hidden');
                }

                const itemData = await fetchItemData(identity, 'BASE');
                if (itemData) {
                    populateDetailsPanel(itemData);
                }
            });
        });
    }

    function populateDetailsPanel(item) {
        const detailsPanel = document.getElementById("details-panel");
        detailsPanel.innerHTML = ''; // Clear existing content

        // Create header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-center justify-between gap-2 p-4 border-b';

        const headerContentDiv = document.createElement('div');
        headerContentDiv.className = 'flex items-center gap-2';

        const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgIcon.setAttribute('class', 'w-5 h-5 text-blue-500');
        svgIcon.setAttribute('fill', 'none');
        svgIcon.setAttribute('stroke', 'currentColor');
        svgIcon.setAttribute('viewBox', '0 0 24 24');
        svgIcon.innerHTML = '<path d="M12 8v4l3 3"></path><circle cx="12" cy="12" r="10"></circle>';

        const headerTitle = document.createElement('h2');
        headerTitle.className = 'text-lg font-semibold';
        console.log(item)
        headerTitle.textContent = item.attributes.name;

        headerContentDiv.appendChild(svgIcon);
        headerContentDiv.appendChild(headerTitle);
        headerDiv.appendChild(headerContentDiv);

        const closeButton = document.createElement('button');
        closeButton.id = 'close-details-panel';
        closeButton.className = 'text-gray-500 hover:text-gray-700';
        closeButton.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        closeButton.addEventListener('click', () => {
            detailsPanel.classList.add('hidden');
        });

        headerDiv.appendChild(closeButton);
        detailsPanel.appendChild(headerDiv);

        // Create content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'divide-y';

        const attributesDiv = document.createElement('div');
        attributesDiv.className = 'p-4';

        const attributes = item.attributes;
        for (const [key, value] of Object.entries(attributes)) {
            const attributeDiv = document.createElement('div');
            attributeDiv.className = 'mb-4';

            const keySpan = document.createElement('span');
            keySpan.className = 'text-sm font-medium text-gray-500 block';
            keySpan.textContent = key;

            attributeDiv.appendChild(keySpan);

            if (Array.isArray(value)) {
                value.forEach(val => {
                    const valueSpan = document.createElement('span');
                    valueSpan.className = 'text-sm text-gray-900 block';
                    valueSpan.textContent = val;
                    attributeDiv.appendChild(valueSpan);
                });
            } else {
                const valueSpan = document.createElement('span');
                valueSpan.className = 'text-sm text-gray-900 block';
                valueSpan.textContent = value;
                attributeDiv.appendChild(valueSpan);
            }

            attributesDiv.appendChild(attributeDiv);
        }

        contentDiv.appendChild(attributesDiv);
        detailsPanel.appendChild(contentDiv);

        detailsPanel.classList.remove('hidden'); // Ensure the details panel is visible
    }

    function showLoadingIndicator() {
        const resultsPanel = document.getElementById("results-panel");
        resultsPanel.innerHTML = '<div class="loading">Loading...</div>';
    }

    function hideLoadingIndicator() {
        // Optionally clear the loading indicator if needed
    }

    function currentYear() {
        return new Date().getFullYear();
    }

    async function checkConnectionStatus() {
        try {
            const response = await fetch('/api/status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const statusElement = document.getElementById('connection-status');
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'OK') {
                    statusElement.textContent = 'Connection Status: OK';
                    statusElement.classList.remove('text-red-500');
                    statusElement.classList.add('text-green-500');
                } else {
                    statusElement.textContent = 'Connection Status: KO';
                    statusElement.classList.remove('text-green-500');
                    statusElement.classList.add('text-red-500');
                }
            } else {
                throw new Error('Failed to fetch status');
            }
        } catch (error) {
            console.error('Error checking connection status:', error);
        }
    }

    setInterval(checkConnectionStatus, 30000);

    // function openModal(userDetails) {
    //     const modal = document.getElementById('user-modal');
    //     const modalContent = document.getElementById('modal-content');
    //     const modalTitle = document.getElementById('modal-title');

    //     // Set the modal title and content
    //     modalTitle.textContent = `Details for ${userDetails.name}`;
    //     modalContent.innerHTML = `
    //         <p><strong>Distinguished Name:</strong> ${userDetails.dn}</p>
    //         <p><strong>Email:</strong> ${userDetails.email}</p>
    //         <p><strong>Phone:</strong> ${userDetails.phone}</p>
    //         <!-- Add more user details as needed -->
    //     `;

    //     // Show the modal
    //     modal.classList.remove('hidden');
    // }

    // function closeModal() {
    //     const modal = document.getElementById('user-modal');
    //     modal.classList.add('hidden');
    // }

    // // Example usage: Attach this function to user elements in your results section
    // document.querySelectorAll('#details-title').forEach(element => {
    //     element.addEventListener('click', function() {
    //         const userDetails = {
    //             name: 'test',
    //             dn: 'test',
    //             email: 'test',
    //             phone: 'test'
    //         };
    //         openModal(userDetails);
    //     });
    // });

    initialize();
});