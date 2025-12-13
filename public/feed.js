const feedbackModal = document.getElementById('feedback-modal');
const confirmationModal = document.getElementById('confirmation-modal');
const mainMenu = document.getElementById('main-menu');
const internalPages = document.querySelectorAll('.internal-page');
const feedbackTab = document.getElementById('feedback-tab');

// --- FORM SUBMISSION LOGIC (UNCHANGED) ---
function submitForm(type, event) {
    event.preventDefault(); // Stop the default form submission

    // Close the main feedback modal
    toggleModal(false);

    if (type === 'bug') {
        // Simulate data processing (in a real app, this would be an AJAX call)
        document.getElementById('bug-report').querySelector('form').reset();
        showConfirmation(
            "Bug Report Received!", 
            "Thank you for reporting this issue. We are now working on a fix."
        );
    } else if (type === 'suggestion') {
        // Simulate data processing
        document.getElementById('suggestion').querySelector('form').reset();
        showConfirmation(
            "Idea Logged!", 
            "Your suggestion has been added to our roadmap for review. Thanks for helping us improve!"
        );
    }
}

// --- CONFIRMATION MODAL LOGIC (NEW) (UNCHANGED) ---
function showConfirmation(title, message) {
    if (title && message) {
        document.getElementById('confirmation-title').textContent = title;
        document.getElementById('confirmation-message').textContent = message;
        confirmationModal.classList.add('active');
    } else {
        confirmationModal.classList.remove('active');
    }
}

// --- DRAGGABLE LOGIC (MODIFIED) ---
let isDragging = false;
let startX, startY, initialX, initialY;
const clickThreshold = 5;

function startDrag(e) {
    if (e.target.closest('.modal-content')) return;

    // 1. Get the current on-screen position (handles rotation correctly)
    const rect = feedbackTab.getBoundingClientRect();
    
    // 2. Convert CSS (right/top) to fixed pixel values (left/top) to start drag
    // This is crucial for fixing the "vanish" bug when dragging starts
    feedbackTab.style.left = rect.left + 'px';
    feedbackTab.style.top = rect.top + 'px';
    
    // 3. Disable the CSS properties that conflict with dragging
    feedbackTab.style.right = 'auto';
    feedbackTab.style.bottom = 'auto';
    
    // 4. Store initial state
    isDragging = true;
    feedbackTab.style.cursor = 'grabbing';
    
    startX = e.clientX;
    startY = e.clientY;
    
    // Use rect.left/top for initial position based on screen
    initialX = rect.left; 
    initialY = rect.top; 
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault(); 
}

function onDrag(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newX = initialX + dx;
    let newY = initialY + dy;

    // --- CLAMPING LOGIC (Anti-Whitespace Fix) ---
    // Get the element's actual dimensions (handles rotation correctly)
    const rect = feedbackTab.getBoundingClientRect(); 
    
    // Calculate the maximum allowed screen boundaries
    const maxX = window.innerWidth - rect.width;
    // Clamping maxY prevents the element from being dragged below the viewport, 
    // which stops the page from growing and fixes the white space issue.
    const maxY = window.innerHeight - rect.height; 
    
    // Clamp X (Left/Right)
    newX = Math.max(0, Math.min(newX, maxX));
    // Clamp Y (Top/Bottom)
    newY = Math.max(0, Math.min(newY, maxY));
    
    // Apply the clamped position
    feedbackTab.style.left = newX + 'px';
    feedbackTab.style.top = newY + 'px';
    // ---------------------------------
    
    if (Math.abs(dx) > clickThreshold || Math.abs(dy) > clickThreshold) {
        feedbackTab.dataset.moved = 'true';
    }
}

function stopDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    
    // 1. Snap back to the right side and 60% vertical center (CSS default)
    feedbackTab.style.left = 'auto'; 
    feedbackTab.style.top = '60%'; 
    feedbackTab.style.right = '1px'; // Forces it to the right edge
    feedbackTab.style.bottom = 'auto'; 
    
    // Re-ensure the transform is active (to keep it rotated)
    feedbackTab.style.transform = 'translateY(-50%) rotate(90deg)'; 

    // 2. Cleanup
    feedbackTab.style.cursor = 'grab';
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    
    const moved = feedbackTab.dataset.moved === 'true';
    if (!moved) {
        toggleModal(true);
    }
    feedbackTab.dataset.moved = 'false';
}

// --- MAIN MODAL & MENU LOGIC (Slightly modified) (UNCHANGED from your provided block) ---
function toggleModal(open) {
    if (open) {
        feedbackModal.classList.add('active');
        showMenu();
    } else {
        feedbackModal.classList.remove('active');
    }
}

function showMenu() {
    mainMenu.style.display = 'block';
    internalPages.forEach(page => {
        page.style.display = 'none';
    });
}

function showPage(pageId) {
    mainMenu.style.display = 'none';
    internalPages.forEach(page => {
        page.style.display = 'none';
    });
    document.getElementById(pageId).style.display = 'block';
}

// Global click handler for closing modals outside content (UNCHANGED from your provided block)
window.onclick = function(event) {
    if (event.target === feedbackModal) {
        toggleModal(false);
    }
    if (event.target === confirmationModal) {
        showConfirmation(false);
    }
}

//form data handling (UNCHANGED from your provided block)
// Function to handle form submission for both Bug and Suggestion
function submitForm(type, event) {
    event.preventDefault(); // Still needed to stop default, but now we manually submit via Fetch!

    const form = event.target;
    const formData = new FormData(form);

    // Close the main feedback modal immediately
    toggleModal(false); 
    
    // --- Manual Submission via Fetch to Web3Forms ---
    fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        // Log the response for debugging (check your browser console)
        console.log('Web3Forms Response:', data); 

        // Check if the submission was successful according to Web3Forms' API response
        if (data.success) {
            form.reset(); // Clear the form fields
            
            if (type === 'bug') {
                showConfirmation(
                    "Bug Report Received!", 
                    "Thank you for reporting this issue. We are now working on a fix."
                );
            } else if (type === 'suggestion') {
                showConfirmation(
                    "Idea Logged!", 
                    "Your suggestion has been added to our roadmap for review. Thanks for helping us improve!"
                );
            }
        } else {
            // Handle error response from the API (e.g., failed access key, etc.)
            showConfirmation(
                "Submission Failed",
                data.message || "There was an error sending the data. Please try again later."
            );
        }
    })
    .catch(error => {
        // Handle network errors (e.g., no internet connection)
        console.error('Network Error:', error);
        showConfirmation(
            "Connection Error", 
            "Could not connect to the submission server. Please check your internet connection."
        );
    });
}
//form handling ends