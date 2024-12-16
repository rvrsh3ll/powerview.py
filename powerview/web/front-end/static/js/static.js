document.addEventListener('DOMContentLoaded', function() {
    const toggles = document.querySelectorAll('.dropdown-toggle');

    toggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const content = this.nextElementSibling;
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });
    });

    const commandHistoryButton = document.getElementById('toggle-command-history');
    const commandHistoryPanel = document.getElementById('command-history-panel');
    const commandHistoryEntries = document.getElementById('command-history-entries');
    const detailsPanel = document.getElementById('details-panel');

    async function fetchCommandLogs() {
        try {
            const response = await fetch('/api/logs');
            const logsData = await response.json();

            if (!response.ok) {
                console.error('Failed to fetch command logs:', logsData.error || 'Unknown error');
                return;
            }

            // Clear existing entries
            commandHistoryEntries.innerHTML = '';

            // Sort logs by timestamp
            logsData.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Append new log entries
            logsData.logs.forEach(log => {
                const entryDiv = createLogEntry(log);
                commandHistoryEntries.appendChild(entryDiv);
            });
        } catch (error) {
            console.error('Error fetching command logs:', error);
        }
    }

    async function fetchSingleCommandLogs() {
        try {
            const response = await fetch('/api/logs?limit=1');
            const logsData = await response.json();

            if (!response.ok) {
                console.error('Failed to fetch single command log:', logsData.error || 'Unknown error');
                return;
            }

            // Check if the log already exists to avoid redundancy
            logsData.logs.forEach(log => {
                const existingEntries = Array.from(commandHistoryEntries.children);
                const logExists = existingEntries.some(entry => {
                    const timestampElement = entry.querySelector('span.text-sm.text-neutral-500');
                    const debugMessageElement = entry.querySelector('code');
                    
                    if (!timestampElement || !debugMessageElement) return false;
                    
                    const timestamp = timestampElement.textContent;
                    const debugMessage = debugMessageElement.textContent;
                    
                    return timestamp === log.timestamp && debugMessage === log.debug_message;
                });

                if (!logExists) {
                    const entryDiv = createLogEntry(log);
                    commandHistoryEntries.insertBefore(entryDiv, commandHistoryEntries.firstChild);
                }
            });
        } catch (error) {
            console.error('Error fetching single command log:', error);
        }
    }

    function createLogEntry(log) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer group';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-center justify-between mb-1';

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'text-sm text-neutral-500 dark:text-neutral-400';
        timestampSpan.textContent = log.timestamp;

        const statusSpan = document.createElement('span');
        statusSpan.className = 'text-sm px-2 py-0.5 rounded-full';

        switch (log.log_type) {
            case 'INFO':
                statusSpan.classList.add('bg-blue-100', 'text-blue-800', 'dark:bg-blue-900/50', 'dark:text-blue-300');
                break;
            case 'WARNING':
                statusSpan.classList.add('bg-yellow-100', 'text-yellow-800', 'dark:bg-yellow-900/50', 'dark:text-yellow-300');
                break;
            case 'SUCCESS':
                statusSpan.classList.add('bg-green-100', 'text-green-800', 'dark:bg-green-900/50', 'dark:text-green-300');
                break;
            case 'ERROR':
                statusSpan.classList.add('bg-red-100', 'text-red-800', 'dark:bg-red-900/50', 'dark:text-red-300');
                break;
            default:
                statusSpan.classList.add('bg-gray-100', 'text-gray-800', 'dark:bg-gray-900/50', 'dark:text-gray-300');
        }

        statusSpan.textContent = log.log_type;

        const commandDiv = document.createElement('div');
        commandDiv.className = 'flex items-center gap-2';

        const commandCode = document.createElement('code');
        commandCode.className = 'text-sm font-mono text-neutral-700 dark:text-neutral-300 flex-1';
        commandCode.textContent = log.debug_message;

        const arrowIcon = document.createElement('svg');
        arrowIcon.className = 'w-4 h-4 text-blue-500 dark:text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
        arrowIcon.setAttribute('fill', 'none');
        arrowIcon.setAttribute('stroke', 'currentColor');
        arrowIcon.setAttribute('viewBox', '0 0 24 24');
        arrowIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';

        headerDiv.appendChild(timestampSpan);
        headerDiv.appendChild(statusSpan);
        commandDiv.appendChild(commandCode);
        commandDiv.appendChild(arrowIcon);
        entryDiv.appendChild(headerDiv);
        entryDiv.appendChild(commandDiv);

        return entryDiv;
    }

    commandHistoryButton.addEventListener('click', function() {
        fetchCommandLogs();
        if (commandHistoryPanel.classList.contains('hidden')) {
            commandHistoryPanel.classList.remove('hidden');
            setTimeout(() => {
                commandHistoryPanel.classList.remove('translate-x-full');
            }, 0);
            detailsPanel.classList.add('hidden');
        } else {
            commandHistoryPanel.classList.add('translate-x-full');
            setTimeout(() => {
                commandHistoryPanel.classList.add('hidden');
            }, 300);
        }
    });

    const closeCommandHistoryButton = document.getElementById('close-command-history-panel');
    if (closeCommandHistoryButton) {
        closeCommandHistoryButton.addEventListener('click', () => {
            const commandHistoryPanel = document.getElementById('command-history-panel');
            if (commandHistoryPanel) {
                commandHistoryPanel.classList.add('translate-x-full');
                setTimeout(() => {
                    commandHistoryPanel.classList.add('hidden');
                }, 300);
            }
        });
    }

    // Run fetchSingleCommandLogs in the background
    setInterval(fetchSingleCommandLogs, 10000); // Fetch every 10 seconds
});

async function handleHttpError(response) {
    if (!response.ok) {
        if (response.status === 400) {
            const errorResponse = await response.json();
            if (errorResponse.error) {
                showErrorAlert(errorResponse.error);
            } else {
                showErrorAlert('An unknown error occurred.');
            }
        } else {
            showErrorAlert(`HTTP error! status: ${response.status}`);
        }
    }
}

async function showSuccessAlert(message) {
    const alertBox = document.querySelector('div[role="alert-success"]');
    const alertMessage = document.getElementById('alert-message-success');
    alertMessage.textContent = message;
    alertBox.hidden = false;

    setTimeout(() => {
        alertBox.hidden = true;
    }, 5000);
}

async function showErrorAlert(message) {
    const alertBox = document.querySelector('div[role="alert-error"]');
    const alertMessage = document.getElementById('alert-message-error');
    alertMessage.textContent = message;
    alertBox.hidden = false;

    setTimeout(() => {
        alertBox.hidden = true;
    }, 5000);
}

function getSpinnerSVG(id, size = 'size-4') {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="${size} fill-neutral-600 motion-safe:animate-spin dark:fill-neutral-300 hidden" id="spinner-${id}">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" />
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" />
        </svg>
    `;
}