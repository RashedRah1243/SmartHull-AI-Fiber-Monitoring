const FAILURE_LOAD = 100;
const MAX_LOAD = 120;
const CRACK_LOCATIONS = [
    { id: 'micro-crack-1', threshold: 22, side: 'left', position: 0.45, location: 'Port midship' },
    { id: 'micro-crack-2', threshold: 40, side: 'left', position: 0.8, location: 'Port aft section' },
    { id: 'micro-crack-3', threshold: 57, side: 'right', position: 0.2, location: 'Starboard forward section' },
    { id: 'micro-crack-4', threshold: 73, side: 'right', position: 0.55, location: 'Starboard midship' }
];
const CARGO_LAYOUT = [
    { threshold: 8, x: 350, level: 0 },
    { threshold: 16, x: 388, level: 0 },
    { threshold: 24, x: 426, level: 0 },
    { threshold: 32, x: 574, level: 0 },
    { threshold: 40, x: 612, level: 0 },
    { threshold: 48, x: 650, level: 0 },
    { threshold: 58, x: 369, level: 1 },
    { threshold: 66, x: 407, level: 1 },
    { threshold: 74, x: 593, level: 1 },
    { threshold: 82, x: 631, level: 1 }
];
const CREW_LOADS = [20, 48, 70];
const CREW_X = [275, 500, 725];

const scene = document.querySelector('.scene');
const welcomeScreen = document.querySelector('#welcome-screen');
const simulator = document.querySelector('#simulator');
const startSimulation = document.querySelector('#start-simulation');
const launchWipe = document.querySelector('#launch-wipe');
const hullWrap = document.querySelector('#hull-wrap');
const hullSvg = document.querySelector('.hull-svg');
const weightInput = document.querySelector('#weight-input');
const weightSlider = document.querySelector('#weight-slider');
const leftHull = document.querySelector('#left-hull-shape');
const rightHull = document.querySelector('#right-hull-shape');
const hullOutline = document.querySelector('#hull-outline');
const hullDeck = document.querySelector('#hull-deck');
const fiberLeftGlow = document.querySelector('#fiber-left-glow');
const fiberRightGlow = document.querySelector('#fiber-right-glow');
const fiberLeft = document.querySelector('#fiber-left');
const fiberRight = document.querySelector('#fiber-right');
const fiberArrowLine = document.querySelector('#fiber-arrow-line');
const microCracksGroup = document.querySelector('#micro-cracks');
const riskPanel = document.querySelector('#risk-panel');
const riskStatus = document.querySelector('#risk-status');
const riskIcon = document.querySelector('#risk-icon');
const riskValue = document.querySelector('#risk-value');
const riskProgress = document.querySelector('#risk-progress');
const riskBar = document.querySelector('#risk-bar');
const riskDescription = document.querySelector('#risk-description');
const crackDetail = document.querySelector('#crack-detail');
const zoomLevel = document.querySelector('#zoom-level');
const detailTitle = document.querySelector('#crack-detail-title');
const detailCopy = document.querySelector('#crack-detail-copy');
const detailLoad = document.querySelector('#detail-load');
const detailRisk = document.querySelector('#detail-risk');
const detailDragHandle = document.querySelector('#detail-drag-handle');
const cargoBoxes = CARGO_LAYOUT.map(({ threshold, x, level }, index) => ({
    threshold,
    x,
    level,
    element: document.querySelector(`#cargo-box-${index + 1}`)
}));
const crewMembers = CREW_LOADS.map((threshold, index) => ({
    threshold,
    x: CREW_X[index],
    element: document.querySelector(`#crew-${index + 1}`)
}));
const microCracks = CRACK_LOCATIONS.map(({ id }) => {
    const element = document.querySelector(`#${id}`);
    return {
        element,
        glow: element.querySelector('.micro-crack-glow'),
        line: element.querySelector('.micro-crack-line')
    };
});

let currentLoad = 0;
let zoom = 1;
let crackFocus = { x: 320, y: 290 };
let selectedCrackIndex = null;
let dragOffset = null;
let launchStarted = false;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function quadraticPoint(start, control, end, progress) {
    const inverse = 1 - progress;
    return (inverse * inverse * start) + (2 * inverse * progress * control) + (progress * progress * end);
}

function deckHeightAt(x, bend) {
    const deckMid = 220 + bend;
    if (x <= 500) {
        const t = (x - 130) / (500 - 130);
        return quadraticPoint(220, deckMid, deckMid, t);
    }
    const t = (x - 500) / (870 - 500);
    return quadraticPoint(deckMid, deckMid, 220, t);
}

function hullGeometry(load) {
    const bend = (load / FAILURE_LOAD) * 82;
    const deckMid = 220 + bend;
    const keelMid = 330 + bend;
    const leftLower = `Q360 ${372 + bend * 0.8} 225 ${305 + bend * 0.4}`;
    const rightLower = `Q640 ${372 + bend * 0.8} 775 ${305 + bend * 0.4}`;
    const fiberCenter = deckMid + 62;
    const fiberLeft = `M190 260 Q330 ${300 + bend * 0.55} 490 ${fiberCenter}`;
    const fiberRight = `M510 ${fiberCenter} Q670 ${300 + bend * 0.55} 810 260`;
    const arrowTargetY = (0.16 * fiberCenter) + (0.48 * (300 + bend * 0.55)) + (0.36 * 260);
    const cracks = CRACK_LOCATIONS.map(({ side, position }) => {
        const point = side === 'left'
            ? {
                x: quadraticPoint(190, 330, 490, position),
                y: quadraticPoint(260, 300 + bend * 0.55, fiberCenter, position)
            }
            : {
                x: quadraticPoint(510, 670, 810, position),
                y: quadraticPoint(fiberCenter, 300 + bend * 0.55, 260, position)
            };
        return {
            path: `M${point.x - 2.5} ${point.y - 4} L${point.x + 1} ${point.y - 1} L${point.x - 1} ${point.y + 1.5} L${point.x + 2.5} ${point.y + 4}`,
            point
        };
    });

    return {
        left: `M130 220 Q315 ${deckMid} 500 ${deckMid} L500 ${keelMid} ${leftLower} Q165 ${276 + bend * 0.2} 130 220Z`,
        right: `M500 ${deckMid} Q685 ${deckMid} 870 220 Q835 ${276 + bend * 0.2} 775 ${305 + bend * 0.4} ${rightLower} L500 ${keelMid}Z`,
        outline: `M130 220 Q315 ${deckMid} 500 ${deckMid} Q685 ${deckMid} 870 220 ${rightLower} Q640 ${372 + bend * 0.8} 500 ${keelMid} ${leftLower} Q165 ${276 + bend * 0.2} 130 220Z`,
        deck: `M130 220 Q315 ${deckMid} 500 ${deckMid} Q685 ${deckMid} 870 220`,
        fiberLeft,
        fiberRight,
        fiberArrow: `M780 386 L705 ${arrowTargetY}`,
        cracks
    };
}

function setZoom(nextZoom) {
    zoom = clamp(nextZoom, 1, 3);
    hullSvg.style.transformOrigin = `${(crackFocus.x / 10)}% ${(crackFocus.y / 4.6)}%`;
    hullSvg.style.transform = `scale(${zoom})`;
    zoomLevel.value = `${zoom.toFixed(zoom % 1 ? 2 : 0)}×`;
    zoomLevel.textContent = zoomLevel.value;
}

function positionInspector(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - crackDetail.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - crackDetail.offsetHeight);
    crackDetail.style.left = `${clamp(left, 0, maxLeft)}px`;
    crackDetail.style.top = `${clamp(top, 0, maxTop)}px`;
    crackDetail.style.right = 'auto';
}

function showCrackDetails(index) {
    selectedCrackIndex = index;
    zoom = 2.25;
    const crack = CRACK_LOCATIONS[index];
    const point = hullGeometry(Math.min(currentLoad, FAILURE_LOAD)).cracks[index].point;
    crackFocus = point;
    detailTitle.textContent = `Microcrack ${index + 1} · ${crack.location}`;
    detailCopy.textContent = `A small surface crack is visible along the fiber-optic route. It first appears at ${crack.threshold} tons in this simulation.`;
    detailLoad.textContent = `${currentLoad} tons`;
    detailRisk.textContent = `${Math.round((Math.min(currentLoad, FAILURE_LOAD) / FAILURE_LOAD) ** 2 * 100)}%`;
    crackDetail.hidden = false;
    const panelRect = crackDetail.getBoundingClientRect();
    positionInspector(panelRect.left, panelRect.top);
    setZoom(zoom);
}

function closeCrackDetails() {
    selectedCrackIndex = null;
    crackDetail.hidden = true;
    zoom = 1;
    setZoom(zoom);
}

function render(load) {
    const boundedLoad = Math.round(clamp(load, 0, MAX_LOAD));
    currentLoad = boundedLoad;
    const normalizedLoad = Math.min(boundedLoad, FAILURE_LOAD);
    const risk = Math.round((normalizedLoad / FAILURE_LOAD) ** 2 * 100);
    const failed = boundedLoad >= FAILURE_LOAD;
    const geometry = hullGeometry(normalizedLoad);

    weightInput.value = String(boundedLoad);
    weightSlider.value = String(boundedLoad);
    leftHull.setAttribute('d', geometry.left);
    rightHull.setAttribute('d', geometry.right);
    hullOutline.setAttribute('d', geometry.outline);
    hullDeck.setAttribute('d', geometry.deck);
    fiberLeftGlow.setAttribute('d', geometry.fiberLeft);
    fiberRightGlow.setAttribute('d', geometry.fiberRight);
    fiberLeft.setAttribute('d', geometry.fiberLeft);
    fiberRight.setAttribute('d', geometry.fiberRight);
    fiberArrowLine.setAttribute('d', geometry.fiberArrow);
    cargoBoxes.forEach(({ threshold, x, level, element }) => {
        element.setAttribute('transform', `translate(${x - 17} ${deckHeightAt(x, normalizedLoad / FAILURE_LOAD * 82) - ((level + 1) * 25)})`);
        element.classList.toggle('is-visible', boundedLoad >= threshold);
    });
    crewMembers.forEach(({ threshold, x, element }) => {
        const stackAtPosition = cargoBoxes.reduce(
            (maxLevel, box) => box.threshold <= boundedLoad && Math.abs(box.x - x) < 42
                ? Math.max(maxLevel, box.level + 1)
                : maxLevel,
            0
        );
        element.setAttribute('transform', `translate(${x - 9} ${deckHeightAt(x, normalizedLoad / FAILURE_LOAD * 82) - (stackAtPosition * 25) - 34})`);
        element.classList.toggle('is-visible', boundedLoad >= threshold);
    });
    let visibleCrackCount = 0;
    CRACK_LOCATIONS.forEach(({ threshold, location }, index) => {
        const crack = microCracks[index];
        const geometryForCrack = geometry.cracks[index];
        const visible = boundedLoad >= threshold;
        crack.glow.setAttribute('d', geometryForCrack.path);
        crack.line.setAttribute('d', geometryForCrack.path);
        crack.element.querySelector('.micro-crack-hit-area').setAttribute('d', geometryForCrack.path);
        crack.element.classList.toggle('is-visible', visible);
        crack.element.setAttribute('tabindex', visible ? '0' : '-1');
        crack.element.setAttribute('aria-label', `Microcrack ${index + 1} at ${location}. ${visible ? 'Click to zoom in and see details.' : `Appears at ${threshold} tons.`}`);
        if (visible) {
            visibleCrackCount += 1;
        }
    });
    const hasCrack = visibleCrackCount > 0 || failed;
    microCracksGroup.setAttribute('aria-hidden', String(visibleCrackCount === 0));
    if (selectedCrackIndex !== null) {
        const selectedStillVisible = boundedLoad >= CRACK_LOCATIONS[selectedCrackIndex].threshold;
        if (!selectedStillVisible) closeCrackDetails();
        else {
            crackFocus = geometry.cracks[selectedCrackIndex].point;
            detailLoad.textContent = `${boundedLoad} tons`;
            detailRisk.textContent = `${risk}%`;
            setZoom(zoom);
        }
    }

    riskValue.textContent = String(risk);
    riskBar.style.width = `${risk}%`;
    riskProgress.setAttribute('aria-valuenow', String(risk));
    scene.classList.toggle('is-broken', failed);
    scene.classList.toggle('has-crack', hasCrack);
    hullWrap.setAttribute(
        'aria-label',
        failed
            ? `Hull visibly fractured at ${boundedLoad} tons, with ${visibleCrackCount} visible microcracks. Click a crack to inspect it.`
            : hasCrack
                ? `Hull bending under ${boundedLoad} tons, with ${visibleCrackCount} visible microcracks. Click a crack to inspect it.`
                : `Hull bending under ${boundedLoad} tons; red fiber-optic cable runs through the hull`
    );

    if (failed) {
        riskPanel.dataset.level = 'broken';
        riskStatus.textContent = 'Hull broken';
        riskIcon.textContent = '!';
        riskDescription.textContent = 'Demo failure load reached. Structure fractured.';
    } else if (risk >= 70) {
        riskPanel.dataset.level = 'danger';
        riskStatus.textContent = 'Very dangerous';
        riskIcon.textContent = '!';
        riskDescription.textContent = 'Critical strain. Failure is imminent.';
    } else if (risk >= 35) {
        riskPanel.dataset.level = 'caution';
        riskStatus.textContent = 'Unsafe';
        riskIcon.textContent = '!';
        riskDescription.textContent = 'High strain. Reduce the applied load.';
    } else {
        riskPanel.dataset.level = 'safe';
        riskStatus.textContent = 'Safe';
        riskIcon.textContent = '✓';
        riskDescription.textContent = 'Hull within safe operating range.';
    }
}

function readWeightInput() {
    if (weightInput.value === '') return;
    const value = Number(weightInput.value);
    if (Number.isFinite(value)) render(value);
}

weightInput.addEventListener('input', readWeightInput);
weightInput.addEventListener('change', () => {
    if (weightInput.value === '') {
        render(currentLoad);
    } else {
        readWeightInput();
    }
});
weightSlider.addEventListener('input', () => render(Number(weightSlider.value)));

document.querySelector('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
document.querySelector('#detail-close').addEventListener('click', closeCrackDetails);
detailDragHandle.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = crackDetail.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    detailDragHandle.setPointerCapture(event.pointerId);
});
detailDragHandle.addEventListener('pointermove', (event) => {
    if (!dragOffset) return;
    positionInspector(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
});
function stopDraggingInspector(event) {
    if (!dragOffset) return;
    dragOffset = null;
    if (detailDragHandle.hasPointerCapture(event.pointerId)) {
        detailDragHandle.releasePointerCapture(event.pointerId);
    }
}
detailDragHandle.addEventListener('pointerup', stopDraggingInspector);
detailDragHandle.addEventListener('pointercancel', stopDraggingInspector);
window.addEventListener('resize', () => {
    if (!crackDetail.hidden) {
        const rect = crackDetail.getBoundingClientRect();
        positionInspector(rect.left, rect.top);
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !crackDetail.hidden) closeCrackDetails();
});

startSimulation.addEventListener('click', () => {
    if (launchStarted) return;
    launchStarted = true;
    startSimulation.disabled = true;

    const enterSimulator = () => {
        welcomeScreen.hidden = true;
        simulator.hidden = false;
        simulator.classList.add('is-entering');
        weightInput.focus();
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        enterSimulator();
        return;
    }

    launchWipe.classList.add('is-active');
    window.setTimeout(enterSimulator, 450);
    launchWipe.addEventListener('animationend', () => {
        launchWipe.classList.remove('is-active');
        simulator.classList.remove('is-entering');
    }, { once: true });
});

microCracks.forEach(({ element }, index) => {
    element.addEventListener('click', () => {
        if (currentLoad >= CRACK_LOCATIONS[index].threshold) showCrackDetails(index);
    });
    element.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && currentLoad >= CRACK_LOCATIONS[index].threshold) {
            event.preventDefault();
            showCrackDetails(index);
        }
    });
});

render(0);
