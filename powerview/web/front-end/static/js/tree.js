document.addEventListener('DOMContentLoaded', () => {
    async function initialize() {
        try {
            const domainInfoResponse = await fetch('/api/get/domaininfo', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            await handleHttpError(domainInfoResponse);

            const domainInfo = await domainInfoResponse.json();
            const rootDn = domainInfo.root_dn;
            const domainName = domainInfo.domain;
            const flatName = domainInfo.flatName;

            const domainSpan = document.querySelector('span#domain-name');
            if (domainSpan) {
                domainSpan.textContent = flatName;
            }

            const rootNodes = [
                { dn: rootDn, icon: icons.adIcon },
                { dn: `CN=Configuration,${rootDn}`, icon: icons.adIcon },
                { dn: `CN=Schema,CN=Configuration,${rootDn}`, icon: icons.defaultIcon },
                { dn: `DC=DomainDnsZones,${rootDn}`, icon: icons.adIcon },
                { dn: `DC=ForestDnsZones,${rootDn}`, icon: icons.adIcon }
            ];

            for (const node of rootNodes) {
                const exists = await checkDistinguishedNameExists(node.dn);
                if (exists) {
                    const treeNode = createTreeNode(node.dn, node.icon);
                    if (node.dn === rootDn) {
                        // Mark the root node as selected
                        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                        treeNode.classList.add('selected');

                        // Automatically expand the rootDn node
                        toggleSubtree(node.dn, treeNode);

                        // Fetch and display the rootDn details in the results panel
                        const rootDnData = await fetchItemData(rootDn, 'BASE');
                        if (rootDnData) {
                            populateResultsPanel(rootDnData);
                        }
                    }
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

    function createTreeNode(dn, icon) {
        const treeView = document.getElementById('tree-view');
        if (!treeView) return;

        const div = document.createElement('div');
        div.classList.add(
            'flex', 
            'items-center', 
            'gap-1', 
            'hover:bg-neutral-100',
            'dark:hover:bg-neutral-800',
            'rounded', 
            'cursor-pointer',
        );

        div.innerHTML += `${icon}<span class="text-neutral-900 dark:text-white">${dn}</span>`;

        div.addEventListener('click', async (event) => {
            event.stopPropagation();

            // Reset to the "General" tab
            selectTab('general');

            // Show the spinner when a tree node is clicked
            // showLoadingIndicator();

            let subtreeContainer = div.nextElementSibling;
            if (subtreeContainer && subtreeContainer.classList.contains('subtree')) {
                subtreeContainer.remove();
                hideLoadingIndicator(); // Hide the spinner if subtree is removed
                return;
            }

            const itemData = await fetchItemData(dn, 'BASE');
            if (itemData) {
                populateResultsPanel(itemData);
                toggleSubtree(dn, div);
            }

            // Hide the spinner after processing
            // hideLoadingIndicator();
        });

        treeView.appendChild(div);
        return div; // Return the created tree node
    }

    
    async function toggleSubtree(searchbase, parentElement) {
        const spinner = document.getElementById(`spinner-${convertDnToId(searchbase)}`);
        if (spinner) {
            spinner.classList.remove('hidden'); // Show the spinner
        }

        let subtreeContainer = parentElement.nextElementSibling;
        if (subtreeContainer && subtreeContainer.classList.contains('subtree')) {
            subtreeContainer.remove();
            if (spinner) {
                spinner.classList.add('hidden'); // Hide the spinner if subtree is removed
            }
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

            await handleHttpError(response);

            const data = await response.json();

            if (Array.isArray(data)) {
                displaySubtree(data, parentElement);
            } else if (data && typeof data === 'object') {
                displaySubtree([data], parentElement);
            } else {
                console.error('Unexpected data format:', data);
            }
        } catch (error) {
            console.error('Error fetching subtree:', error);
        } finally {
            if (spinner) {
                spinner.classList.add('hidden'); // Hide the spinner after processing
            }
        }
    }

    async function getDomainGroupMember(groupName) {
        try {
            const response = await fetch('/api/get/domaingroupmember', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ identity: groupName })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch group members');
            }

            const data = await response.json();
            console.log('Group Members:', data);
        } catch (error) {
            console.error('Error fetching group members:', error);
        }
    }

    function displaySubtree(dataArray, parentElement) {
        const subtreeContainer = document.createElement('div');
        subtreeContainer.classList.add(
            'ml-6', 
            'subtree',
            'space-y-1'
        );

        dataArray.forEach(obj => {
            const objDiv = document.createElement('div');
            objDiv.classList.add(
                'flex', 
                'items-center', 
                'gap-1', 
                'hover:bg-neutral-100',
                'dark:hover:bg-neutral-800',
                'rounded', 
                'cursor-pointer',
            );

            let iconSVG = icons.defaultIcon;
            let objectClassLabel = 'Object'; // Default label

            // Ensure obj.attributes.objectClass is an array before using includes
            if (Array.isArray(obj.attributes.objectClass)) {
                if (obj.attributes.objectClass.includes('group')) {
                    iconSVG = icons.groupIcon;
                    objectClassLabel = 'Group';
                } else if (obj.attributes.objectClass.includes('container')) {
                    iconSVG = icons.containerIcon; // Use fa-box-open for containers
                    objectClassLabel = 'Container';
                } else if (obj.attributes.objectClass.includes('computer')) {
                    iconSVG = icons.computerIcon; // Use fa-desktop for computers
                    objectClassLabel = 'Computer';
                } else if (obj.attributes.objectClass.includes('user')) {
                    iconSVG = icons.userIcon;
                    objectClassLabel = 'User';
                } else if (obj.attributes.objectClass.includes('organizationalUnit')) {
                    iconSVG = icons.ouIcon; // Use fa-building for organizational units
                    objectClassLabel = 'Organizational Unit';
                } else if (obj.attributes.objectClass.includes('builtinDomain')) {
                    iconSVG = icons.builtinIcon;
                    objectClassLabel = 'Builtin';
                } else {
                    objectClassLabel = obj.attributes.objectClass[obj.attributes.objectClass.length - 1];
                }

                if (obj.attributes.adminCount === 1) {
                    iconSVG += icons.keyIcon;
                }
            }

            const escapedDn = convertDnToId(obj.dn);

            // Assign a data-identifier attribute to each tree node
            objDiv.setAttribute('data-identifier', obj.dn);

            objDiv.innerHTML = `${iconSVG}<span class="cursor-pointer text-neutral-900 dark:text-white">${obj.attributes.name || obj.dn}</span>${getSpinnerSVG(escapedDn)}`;

            // Set the title attribute to show the object class on hover
            objDiv.setAttribute('title', objectClassLabel);

            objDiv.addEventListener('click', async (event) => {
                event.stopPropagation();

                // Reset to the "General" tab
                selectTab('general');

                // Mark this node as selected
                document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                objDiv.classList.add('selected');

                const membersTab = document.querySelector('[aria-controls="tabpanelMembers"]');
                if (membersTab) {
                    if (obj.attributes.objectClass && obj.attributes.objectClass.includes('group')) {
                        membersTab.style.display = '';
                    } else {
                        membersTab.style.display = 'none';
                    }
                }

                // Show the spinner on the right side of the node
                showLoadingIndicator();
                let childSubtreeContainer = objDiv.nextElementSibling;
                if (childSubtreeContainer && childSubtreeContainer.classList.contains('subtree')) {
                    childSubtreeContainer.remove();
                    hideLoadingIndicator(); // Hide the spinner if subtree is removed
                    return;
                }

                const itemData = await fetchItemData(obj.dn, 'BASE');
                if (itemData) {
                    populateResultsPanel(itemData);
                    toggleSubtree(obj.dn, objDiv);
                }

                // Hide the spinner after processing
                hideLoadingIndicator();
            });

            subtreeContainer.appendChild(objDiv);
        });

        parentElement.insertAdjacentElement('afterend', subtreeContainer);
    }

    function populateResultsPanel(item) {
        const resultsPanel = document.getElementById("general-content");
        const attributes = item.attributes;
        
        const searchInput = document.getElementById('tab-search');
        const currentSearchQuery = searchInput ? searchInput.value.toLowerCase() : '';

        // Create the header div with buttons
        const headerDiv = document.createElement('div');
        headerDiv.className = 'bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white px-4 py-1 border-b border-neutral-200 dark:border-neutral-700 sticky top-0 z-10';
        
        // Create flex container for header content
        const headerContent = document.createElement('div');
        headerContent.className = 'flex justify-between items-center';
        
        // Create title
        const headerH3 = document.createElement('h3');
        headerH3.className = 'font-medium';
        headerH3.textContent = attributes.name || 'Details';

        // Create buttons container
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'flex gap-2';

        // Add User button
        const addUserButton = document.createElement('button');
        addUserButton.className = 'px-2 py-1.5 text-sm font-medium rounded-md text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-yellow-500 dark:hover:text-yellow-400 dark:hover:bg-yellow-900/20 transition-colors';
        addUserButton.innerHTML = icons.userIcon;
        addUserButton.setAttribute('title', 'Add User');
        addUserButton.onclick = () => handleCreateUser(item.dn);
        buttonsDiv.appendChild(addUserButton);

        // Add Group button
        const addGroupButton = document.createElement('button');
        addGroupButton.className = 'px-2 py-1.5 text-sm font-medium rounded-md text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-yellow-500 dark:hover:text-yellow-400 dark:hover:bg-yellow-900/20 transition-colors';
        addGroupButton.innerHTML = icons.groupIcon;
        addGroupButton.setAttribute('title', 'Add Group');
        addGroupButton.onclick = () => handleCreateGroup(item.dn);
        buttonsDiv.appendChild(addGroupButton);

        // Add "Add User to Group" button only if object is a group
        if (Array.isArray(attributes.objectClass) && attributes.objectClass.includes('group')) {
            const addUserToGroupButton = document.createElement('button');
            addUserToGroupButton.className = 'px-2 py-1.5 text-sm font-medium rounded-md text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-yellow-500 dark:hover:text-yellow-400 dark:hover:bg-yellow-900/20 transition-colors';
            addUserToGroupButton.innerHTML = '<i class="fa-solid fa-user-plus"></i>';
            addUserToGroupButton.setAttribute('title', 'Add User to Group');
            addUserToGroupButton.onclick = () => handleAddGroupMember(item.attributes.name);
            buttonsDiv.appendChild(addUserToGroupButton);
        }

        // Create Details button
        const detailsButton = document.createElement('button');
        detailsButton.className = 'px-2 py-1.5 text-sm font-medium rounded-md text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors';
        detailsButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        detailsButton.setAttribute('title', 'Edit');
        detailsButton.onclick = (event) => handleLdapLinkClick(event, item.dn);

        // Create Delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'px-2 py-1.5 text-sm font-medium rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 transition-colors';
        deleteButton.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        deleteButton.setAttribute('title', 'Delete');
        deleteButton.onclick = () => showDeleteModal(item.dn);

        // Assemble the header
        buttonsDiv.appendChild(detailsButton);
        buttonsDiv.appendChild(deleteButton);
        headerContent.appendChild(headerH3);
        headerContent.appendChild(buttonsDiv);
        headerDiv.appendChild(headerContent);

        // Create the content div
        const contentDiv = document.createElement('div');
        contentDiv.className = 'p-4 space-y-2';

        const dl = document.createElement('dl');
        dl.className = 'grid grid-cols-1 gap-3';

        for (const [key, value] of Object.entries(attributes)) {
            const isDistinguishedName = Array.isArray(value) ? value.some(isValidDistinguishedName) : isValidDistinguishedName(value);

            const flexDiv = document.createElement('div');
            flexDiv.className = 'flex result-item hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded';

            // Apply initial visibility based on current search
            if (currentSearchQuery) {
                const textContent = `${key}${Array.isArray(value) ? value.join(' ') : value}`.toLowerCase();
                if (!textContent.includes(currentSearchQuery)) {
                    flexDiv.classList.add('hidden');
                }
            }

            const dt = document.createElement('dt');
            dt.className = 'text-sm font-medium text-neutral-600 dark:text-neutral-400 w-1/3';
            dt.textContent = key;
            flexDiv.appendChild(dt);

            const dd = document.createElement('dd');
            dd.className = 'mt-1 text-sm text-neutral-900 dark:text-white w-2/3 break-all';

            if (isDistinguishedName) {
                if (Array.isArray(value)) {
                    value.forEach(v => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'flex items-center gap-2 group';

                        const link = document.createElement('a');
                        link.href = '#';
                        link.className = 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300';
                        link.dataset.identity = v;
                        link.onclick = (event) => handleLdapLinkClick(event, v);
                        link.textContent = v;
                        
                        const copyButton = createCopyButton(v);
                        
                        wrapper.appendChild(link);
                        wrapper.appendChild(copyButton);
                        dd.appendChild(wrapper);
                        dd.appendChild(document.createElement('br'));
                    });
                } else {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'flex items-center gap-2 group';

                    const link = document.createElement('a');
                    link.href = '#';
                    link.className = 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300';
                    link.dataset.identity = value;
                    link.onclick = (event) => handleLdapLinkClick(event, value);
                    link.textContent = value;
                    
                    const copyButton = createCopyButton(value);
                    
                    wrapper.appendChild(link);
                    wrapper.appendChild(copyButton);
                    dd.appendChild(wrapper);
                }
            } else {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center gap-2 group';
                
                const textSpan = document.createElement('span');
                if (Array.isArray(value)) {
                    const formattedValue = value.map(v => isByteData(v) ? convertToBase64(v) : v);
                    textSpan.innerHTML = formattedValue.join('<br>');
                    const copyButton = createCopyButton(formattedValue.join('\n'));
                    wrapper.appendChild(textSpan);
                    wrapper.appendChild(copyButton);
                } else {
                    const formattedValue = isByteData(value) ? convertToBase64(value) : value;
                    textSpan.textContent = formattedValue;
                    const copyButton = createCopyButton(formattedValue);
                    wrapper.appendChild(textSpan);
                    wrapper.appendChild(copyButton);
                }
                
                dd.appendChild(wrapper);
            }

            flexDiv.appendChild(dd);
            dl.appendChild(flexDiv);
        }

        contentDiv.appendChild(dl);
        resultsPanel.innerHTML = '';
        resultsPanel.appendChild(headerDiv);
        resultsPanel.appendChild(contentDiv);
    }

    // Helper function to create copy button
    function createCopyButton(text) {
        const copyButton = document.createElement('button');
        copyButton.className = 'opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-opacity p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800';
        copyButton.innerHTML = '<i class="fas fa-copy fa-xs"></i>';
        copyButton.title = 'Copy to clipboard';
        
        copyButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    try {
                        document.execCommand('copy');
                        textArea.remove();
                    } catch (err) {
                        console.error('Fallback: Oops, unable to copy', err);
                        textArea.remove();
                        throw new Error('Copy failed');
                    }
                }
                
                copyButton.innerHTML = '<i class="fas fa-check fa-xs"></i>';
                setTimeout(() => {
                    copyButton.innerHTML = '<i class="fas fa-copy fa-xs"></i>';
                }, 1000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
                showErrorAlert('Failed to copy to clipboard');
            }
        });
        
        return copyButton;
    }

    function getSelectedIdentity() {
        const selectedElement = document.querySelector('.selected');
        return selectedElement ? selectedElement.getAttribute('data-identifier') : null;
    }

    function setupTabEventDelegation() {
        const tabList = document.querySelector('[role="tablist"]');
        if (!tabList) return;

        tabList.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('[role="tab"]');
            if (!clickedTab) return;

            // Update the active state of tabs
            tabList.querySelectorAll('[role="tab"]').forEach(tab => {
                tab.setAttribute('aria-selected', tab === clickedTab ? 'true' : 'false');
            });

            // Update the visibility of tab panels
            const tabPanels = document.querySelectorAll('[role="tabpanel"]');
            tabPanels.forEach(panel => {
                panel.style.display = panel.id === clickedTab.getAttribute('aria-controls') ? 'block' : 'none';
            });
        });
    }

    function showDeleteModal(identity) {
        const modal = document.getElementById('popup-modal');
        const overlay = document.getElementById('modal-overlay');
        document.getElementById('identity-to-delete').textContent = identity;
        
        modal.removeAttribute('aria-hidden');
        modal.classList.remove('hidden');
        overlay.classList.remove('hidden');

        const firstButton = modal.querySelector('button');
        if (firstButton) {
            firstButton.focus();
        }
    }

    // Add event listener for confirm delete button
    document.getElementById('confirm-delete')?.addEventListener('click', async () => {
        const identity = document.getElementById('identity-to-delete').textContent;
        if (identity) {
            const selectedNode = document.querySelector('.selected');
            if (selectedNode) {
                // Get the parent subtree container
                const subtreeContainer = selectedNode.closest('.subtree');
                if (!subtreeContainer) {
                    console.error('No parent subtree found');
                    return;
                }

                // Get the parent node (the div before the subtree container)
                const parentNode = subtreeContainer.previousElementSibling;
                if (!parentNode) {
                    console.error('No parent node found');
                    return;
                }

                const parentDn = parentNode.getAttribute('data-identifier');

                const success = await deleteDomainObject(identity, identity);
                if (success && parentDn) {
                    // Select the parent node
                    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    parentNode.classList.add('selected');
                    
                    // Refresh the parent's subtree
                    await refreshCurrentSubtree();
                }
            }
            
            // Hide the modal
            document.getElementById('popup-modal').classList.add('hidden');
            document.getElementById('modal-overlay').classList.add('hidden');
        }
    });

    document.querySelectorAll('[data-modal-hide]').forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.getAttribute('data-modal-hide');
            const modal = document.getElementById(modalId);
            
            modal.setAttribute('aria-hidden', 'true');
            modal.classList.add('hidden');
            document.getElementById('modal-overlay').classList.add('hidden');

            const triggerElement = document.querySelector(`[data-modal-target="${modalId}"]`);
            if (triggerElement) {
                triggerElement.focus();
            }
        });
    });

    async function addDomainGroupMember(groupname, member) {
        try {
            const response = await fetch('/api/add/domaingroupmember', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    identity: groupname, 
                    members: member
                })
            });

            await handleHttpError(response);

            const result = await response.json();
            if (result.success) {
                showSuccessAlert(`Added ${member} to ${groupname}`);
            } else {
                showErrorAlert(result.message);
            }
        } catch (error) {
            console.error('Error adding group member:', error);
            showErrorAlert('Failed to add group member. Please try again.');
        }
    }

    async function addGroup(groupname, basedn) {
        try {
            const response = await fetch('/api/add/domaingroup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    groupname, 
                    basedn: basedn || ''
                })
            });

            await handleHttpError(response);

            const result = await response.json();
            if (result.success) {
                showSuccessAlert(`Added group ${groupname} to ${basedn}`);
            } else {
                showErrorAlert(result.message);
            }
            
            // Refresh the current subtree to show the new group
            await refreshCurrentSubtree();
        } catch (error) {
            console.error('Error adding group:', error);
            showErrorAlert('Failed to add group. Please try again.');
        }
    }
    
    async function addUser(username, password, basedn) {
        try {
            const response = await fetch('/api/add/domainuser', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    username, 
                    userpass: password,
                    basedn: basedn || ''
                })
            });

            await handleHttpError(response);

            const result = await response.json();
            if (result.success) {
                showSuccessAlert(`Added user ${username} to ${basedn}`);
            } else {
                showErrorAlert(result.message);
            }
            
            // Refresh the current subtree to show the new user
            await refreshCurrentSubtree();
        } catch (error) {
            console.error('Error adding user:', error);
            showErrorAlert('Failed to add user. Please try again.');
        }
    }

    async function showAddGroupModal(containerDn) {
        const modal = document.getElementById('add-group-modal');
        const overlay = document.getElementById('modal-overlay');
        const basednInput = document.getElementById('group-base-dn');
        const groupnameInput = document.getElementById('new-groupname');
    
        if (basednInput) {
            basednInput.value = containerDn;
        }
        
        try {
            // Show the modal
            modal.removeAttribute('aria-hidden');
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
    
            // Focus on the groupname input
            if (groupnameInput) {
                setTimeout(() => {
                    groupnameInput.focus();
                }, 100); // Small delay to ensure modal is fully visible
            }
        } catch (error) {
            console.error('Error initializing Add Group Modal:', error);
            showErrorAlert('Failed to initialize Add Group Modal');
        }
    }

    document.getElementById('add-group-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const groupname = document.getElementById('new-groupname')?.value;
        const basedn = document.getElementById('group-base-dn')?.value;

        if (!groupname || !basedn) {
            showErrorAlert('Please fill in all fields');
            return;
        }

        try {
            await addGroup(groupname, basedn);
            
            // Close the modal
            document.getElementById('add-group-modal').classList.add('hidden');
            document.getElementById('modal-overlay').classList.add('hidden');
            
            // Clear the form
            document.getElementById('add-group-form').reset();
        } catch (error) {
            console.error('Error adding group:', error);
            showErrorAlert('Failed to add group');
        }
    });

    async function showAddGroupMemberModal(groupName) {
        const modal = document.getElementById('add-group-member-modal');
        const overlay = document.getElementById('modal-overlay');
        const groupNameInput = document.getElementById('group-name');
        const memberInput = document.getElementById('new-member');

        if (groupNameInput) {
            groupNameInput.value = groupName;
        }

        try {
            // Show the modal
            modal.removeAttribute('aria-hidden');
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');

            // Focus on the member input
            if (memberInput) {
                setTimeout(() => {
                    memberInput.focus();
                }, 100); // Small delay to ensure modal is fully visible
            }
        } catch (error) {
            console.error('Error initializing Add Group Member Modal:', error);
            showErrorAlert('Failed to initialize Add Group Member Modal');
        }
    }

    document.getElementById('add-group-member-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const groupname = document.getElementById('group-name')?.value;
        const member = document.getElementById('new-member')?.value;
        if (!groupname || !member) {
            showErrorAlert('Please fill in all fields');
            return;
        }

        addDomainGroupMember(groupname, member);
        document.getElementById('add-group-member-modal')?.classList.add('hidden');
        document.getElementById('modal-overlay')?.classList.add('hidden');
    });

    async function showAddUserModal(containerDn) {
        const modal = document.getElementById('add-user-modal');
        const overlay = document.getElementById('modal-overlay');
        const basednInput = document.getElementById('user-base-dn');
        const usernameInput = document.getElementById('new-username');

        if (basednInput) {
            basednInput.value = containerDn;
        }
        
        try {
            // Show the modal
            modal.removeAttribute('aria-hidden');
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');

            // Focus on the username input
            if (usernameInput) {
                setTimeout(() => {
                    usernameInput.focus();
                }, 100); // Small delay to ensure modal is fully visible
            }
        } catch (error) {
            console.error('Error initializing Add User Modal:', error);
            showErrorAlert('Failed to initialize Add User Modal');
        }
    }

    document.getElementById('add-user-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const username = document.getElementById('new-username')?.value;
        const password = document.getElementById('new-password')?.value;
        const basedn = document.getElementById('user-base-dn')?.value;
        if (!username || !password) {
            showErrorAlert('Please fill in all fields');
            return;
        }

        addUser(username, password, basedn);
        document.getElementById('add-user-modal')?.classList.add('hidden');
        document.getElementById('modal-overlay')?.classList.add('hidden');
    });

    // Add these functions to handle user and group creation
    function handleCreateUser(containerDn) {
        console.log('Create user in container:', containerDn);
        showAddUserModal(containerDn);
    }

    function handleCreateGroup(containerDn) {
        console.log('Create group in container:', containerDn);
        showAddGroupModal(containerDn);
    }

    function handleAddGroupMember(groupName) {
        console.log('Add member to group:', groupName);
        showAddGroupMemberModal(groupName);
    }

    async function refreshCurrentSubtree() {
        const selectedNode = document.querySelector('.selected');
        if (!selectedNode) return;

        const dn = selectedNode.getAttribute('data-identifier');
        const parentDiv = selectedNode.closest('div');
        
        // Find and remove the existing subtree
        const existingSubtree = selectedNode.nextElementSibling;
        if (existingSubtree && existingSubtree.classList.contains('subtree')) {
            existingSubtree.remove();
        }

        // Re-fetch and display the subtree
        try {
            showLoadingIndicator();
            await toggleSubtree(dn, parentDiv);
        } catch (error) {
            console.error('Error refreshing subtree:', error);
        } finally {
            hideLoadingIndicator();
        }
    }

    // Call this function after the DOM is fully loaded
    initialize();
    setupTabEventDelegation();
});