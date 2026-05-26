/* main.js - 修正穿幫與提示字遺漏版 */
import { Application } from 'https://unpkg.com/@splinetool/runtime/build/runtime.js';

// --- 1. 基礎初始化 ---
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({
    duration: 0.8, 
    smoothWheel: true,
    easing: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t), 
});
function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

// --- 2. Spline 3D 初始化 ---
const splineCanvas = document.getElementById('canvas3d');
const splineApp = new Application(splineCanvas);
splineApp.load('https://prod.spline.design/BYDJCk4XCKKLZ6MD/scene.splinecode');

// --- 3. 文字拆解 ---
const splitText = (el) => {
    const text = el.innerText;
    el.innerHTML = '';
    const words = text.split(/(\n|<br>)/);
    words.forEach((word) => {
        if (word === '\n' || word === '<br>') {
            el.appendChild(document.createElement('br'));
            return;
        }
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        [...word].forEach((char) => {
            if (char.trim() === '') {
                wordSpan.innerHTML += '&nbsp;';
            } else {
                const charSpan = document.createElement('span');
                charSpan.className = 'char';
                charSpan.innerText = char;
                wordSpan.appendChild(charSpan);
            }
        });
        el.appendChild(wordSpan);
    });
};
document.querySelectorAll('.split-text').forEach(splitText);

// --- 4. Three.js: 高質感場景設定 ---
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// 背景霧氣：隨深度增加
scene.fog = new THREE.FogExp2(0x081B3A, 0.05);

// [氣泡系統] 
function createBubbleTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(cvs);
}

const bubblesGeometry = new THREE.BufferGeometry();
const posArray = new Float32Array(400 * 3);
for(let i=0; i < 400*3; i++) posArray[i] = (Math.random()-0.5)*25;
bubblesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

const bubblesMaterial = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {
        uTime: { value: 0 }, uScroll: { value: 0 }, uColor: { value: new THREE.Color(0x8EE6FF) },
        uTexture: { value: createBubbleTexture() }, uGlobalAlpha: { value: 1.0 }, uSizeScale: { value: 1.0 }
    },
    vertexShader: `
        varying float vDistance; uniform float uTime; uniform float uScroll; uniform float uSizeScale;
        void main() {
            vec3 p = position;
            p.y += mod(uTime * 1.5 + position.y, 20.0) - 10.0;
            p.y -= uScroll * 0.005;
            vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
            vDistance = abs(mvPos.z);
            gl_PointSize = (150.0 / vDistance) * uSizeScale;
            gl_Position = projectionMatrix * mvPos;
        }
    `,
    fragmentShader: `
        varying float vDistance; uniform sampler2D uTexture; uniform vec3 uColor; uniform float uGlobalAlpha;
        void main() {
            vec2 uv = gl_PointCoord.xy;
            float dist = distance(uv, vec2(0.5));
            if (dist > 0.5) discard;
            float rim = smoothstep(0.3, 0.5, dist);
            float highlight = smoothstep(0.2, 0.0, distance(uv, vec2(0.3, 0.3)));
            vec3 color = mix(uColor, vec3(1.0), rim * 0.4 + highlight * 0.8);
            float alpha = (0.2 + rim * 0.5 + highlight) * (1.0 - smoothstep(10.0, 20.0, vDistance));
            gl_FragColor = vec4(color, alpha * uGlobalAlpha);
        }
    `
});
const bubblesMesh = new THREE.Points(bubblesGeometry, bubblesMaterial);
scene.add(bubblesMesh);

// [第二區物件：生命史] 
// 建立相機滑軌，GSAP 將移動這個滑軌，讓相機本身可以保留給滑鼠視差互動
const cameraRig = new THREE.Group();
scene.add(cameraRig);
cameraRig.add(camera);
camera.position.z = 10; // 相機相對於軌道的初始距離
 
// --- 高質感材質定義 ---
// 1. 生命體材質 (玻璃透光、清透感)
const jellyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xaaddff, emissive: 0x113355, emissiveIntensity: 0.5,
    roughness: 0.1, metalness: 0.1, transmission: 0.9, thickness: 0.5, // 透光效果
    clearcoat: 1.0, clearcoatRoughness: 0.1, transparent: true, opacity: 1
});

// 2. 岩石材質與噪點生成 (真實粗糙感)
function createNoiseTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 512;
    const ctx = cvs.getContext('2d');
    const imgData = ctx.createImageData(512, 512);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const val = Math.floor(Math.random() * 255);
        imgData.data[i] = imgData.data[i+1] = imgData.data[i+2] = val;
        imgData.data[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return new THREE.CanvasTexture(cvs);
}
const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x11111a, roughness: 1.0, metalness: 0.1,
    bumpMap: createNoiseTexture(), bumpScale: 0.8
});

// --- 場景物件佈局 (水平分佈) ---
// [第 1 站：相遇] (X = 20)
const stage1X = 20;
const particleGeo = new THREE.SphereGeometry(0.1, 32, 32);
const particleA = new THREE.Mesh(particleGeo, jellyMaterial.clone());
const particleB = new THREE.Mesh(particleGeo, jellyMaterial.clone());
particleA.material.opacity = 0; particleB.material.opacity = 0;
scene.add(particleA, particleB);

// 核心生命點 (受精卵)
const zygoteGeo = new THREE.SphereGeometry(0.15, 32, 32);
const positions = zygoteGeo.attributes.position;
for(let i = 0; i < positions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(positions, i);
    // 稍微擾亂頂點，讓它不是完美的圓，更像一團能量
    v.multiplyScalar(1 + Math.random() * 0.15); 
    positions.setXYZ(i, v.x, v.y, v.z);
}
zygoteGeo.computeVertexNormals();
const zygoteMat = new THREE.MeshBasicMaterial({
    color: 0xaaddff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
});
const zygoteGroup = new THREE.Mesh(zygoteGeo, zygoteMat); // 直接用 Mesh 取代 Group
zygoteGroup.scale.set(0,0,0);
scene.add(zygoteGroup);

// [第 3, 4 站：岩石與生長] (X = 60)
const stage3X = 60;

// 將岩石用 Sphere 圓形球體並加入平滑雜訊
const rockGeo = new THREE.SphereGeometry(3.5, 64, 64);
const posAttr = rockGeo.attributes.position;
const v = new THREE.Vector3();
for(let i=0; i<posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    // 產生起伏的岩石表面
    const noise = 1 + (Math.sin(v.x * 2) * Math.cos(v.y * 2) * Math.sin(v.z * 2)) * 0.15 + (Math.random() * 0.05);
    v.multiplyScalar(noise);
    posAttr.setXYZ(i, v.x, v.y, v.z);
}
rockGeo.computeVertexNormals();
const rock = new THREE.Mesh(rockGeo, rockMaterial);
rock.position.set(stage3X, -4, 0);
scene.add(rock);

// 水螅體 (Polyp) 群組
const polypGroup = new THREE.Group();
polypGroup.position.set(stage3X, -1.2, 0); // 附著在岩石上方
polypGroup.scale.set(0,0,0);
scene.add(polypGroup);

// 身體 (Stalk)
const stalkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1, 16);
stalkGeo.translate(0, 0.5, 0); // 確保從底部向上生長
const stalk = new THREE.Mesh(stalkGeo, jellyMaterial);
polypGroup.add(stalk);

// 觸手 (Tentacles)
const tentacles = new THREE.Group();
tentacles.position.y = 1;
for(let i=0; i<8; i++) {
    // Capsule(半徑, 長度, 橫向分段, 縱向分段) -> 呈現條狀且兩端圓潤
    const tGeo = new THREE.SphereGeometry(0.02, 16, 16);
    // 用 scale 將 Y 軸拉長，變成圓潤的長條
    tGeo.scale(1, 10, 1); 
    tGeo.translate(0, 0.4, 0); // 基準點移到根部
    const t = new THREE.Mesh(tGeo, jellyMaterial);
    const angle = (i/8) * Math.PI * 2;
    t.rotation.z = Math.PI / 4; // 向外張開
    t.rotation.y = angle;
    tentacles.add(t);
}
polypGroup.add(tentacles);

// 碟狀幼體 (Ephyrae - 星星形狀)
function createEphyra() {
    const group = new THREE.Group();
    // 為每個碟狀體克隆獨立材質
    const individualMat = jellyMaterial.clone(); 
    
    const domeGeo = new THREE.SphereGeometry(0.25, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(1, 0.4, 1);
    domeGeo.rotateX(Math.PI); 
    const dome = new THREE.Mesh(domeGeo, individualMat);
    group.add(dome);

    const armGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.4, 8);
    armGeo.translate(0, 0.2, 0);
    for(let i=0; i<8; i++) {
        const arm = new THREE.Mesh(armGeo, individualMat);
        const angle = (i/8) * Math.PI * 2;
        arm.rotation.z = Math.PI / 4; 
        arm.rotation.y = angle;
        arm.position.y = -0.05; 
        group.add(arm);
    }
    // 方便後續抓取材質進行淡出動畫
    group.userData.material = individualMat; 
    return group;
}

const ephyraeGroup = new THREE.Group();
ephyraeGroup.position.set(stage3X, -1.2, 0);
scene.add(ephyraeGroup);

const ephyraeStars = [];
for(let i=0; i<5; i++) {
    const star = createEphyra();
    star.position.y = 1 + i * 0.2; // 疊在水螅體上方 (這部分GSAP會重新設定)
    star.scale.set(0,0,0);
    ephyraeStars.push(star);
    ephyraeGroup.add(star);
    // GSAP會將其移入場景
}
/*const ephyraeGroup = new THREE.Group();
ephyraeGroup.position.set(stage3X, -1.2, 0);
scene.add(ephyraeGroup);

const ephyraeStars = [];
const starShape = new THREE.Shape();
for(let i=0; i<=16; i++) {
    const angle = (i/16) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.4 : 0.15; 
    if(i===0) starShape.moveTo(Math.cos(angle)*r, Math.sin(angle)*r);
    else starShape.lineTo(Math.cos(angle)*r, Math.sin(angle)*r);
}
const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
starGeo.rotateX(Math.PI / 2); // 躺平

// 疊 6 個碟狀幼體
for(let i=0; i<6; i++) {
    const starMat = jellyMaterial.clone();
    starMat.emissive.setHex(0x225577); // 稍微亮一點
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = 1 + i * 0.15; // 緊密疊加
    star.scale.set(0,0,0);
    polypGroup.add(star);
    ephyraeStars.push(star);
}*/

// 誕生小水母
const cursorJelly = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 8),
    new THREE.MeshBasicMaterial({ color: 0x8EE6FF, transparent: true, opacity: 0, wireframe: true })
);
scene.add(cursorJelly);

// 燈光
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const pLight = new THREE.PointLight(0x8EE6FF, 5, 40);
pLight.position.set(5, 5, 5);
scene.add(pLight);

camera.position.z = 8;

// --- 5. 整合式大時間軸 (Master Timeline) ---
const bgLayer = document.getElementById('bg-color-layer');
const masterTl = gsap.timeline({
    scrollTrigger: {
        trigger: ".main-wrapper",
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
    },
});

// [ 第一區：Hero 段落 ]
masterTl.addLabel("hero");

const depthColors = ["#1F8CD9", "#104F8C", "#081B3A", "#020814", "#01040A"];
depthColors.forEach((color, i) => {
    if (i > 0) masterTl.to(bgLayer, { backgroundColor: color, ease: "none" }, i * 0.2);
});

// 第一部分：水母沖刺游走
masterTl.to('#canvas3d', {
    xPercent: 120, yPercent: 120, scale: 0.4, rotation: 30, opacity: 0, 
    filter: 'blur(30px) brightness(1.5)', ease: "power2.in", duration: 1
}, "hero");

// 第一部分：文字炸開
masterTl.to('#hero-section .char', {
    opacity: 0, filter: 'blur(10px)', 
    x: () => (Math.random() - 0.5) * 400, y: -200, scale: 2,
    stagger: { amount: 0.3, from: "center" }, duration: 1
}, "hero");

// 補回提示字元「↓ 開始探索」淡出動畫
masterTl.to('.scroll-hint', { opacity: 0, duration: 0.5 }, "hero");

// 第一部分：氣泡變淡
masterTl.to(bubblesMaterial.uniforms.uGlobalAlpha, { value: 0, duration: 1.5}, "hero");

// [ 轉場 1：前往相遇 ]
masterTl.to(cameraRig.position, { x: stage1X, duration: 2, ease: "power1.inOut" }, "hero+=0.5");

// [ 階段 1：不規則相遇 ]
masterTl.addLabel("stage1");
masterTl.to('.stage-1 .char', { opacity: 1, y: 0, stagger: 0.02 }, "stage1");

// 粒子分別從左上與右下出現，採用混亂路徑 (分離 XY 軸動畫)
masterTl.fromTo([particleA.material, particleB.material], {opacity: 0}, { opacity: 1, duration: 0.2 }, "stage1");
// A: 左上
masterTl.fromTo(particleA.position, {x: stage1X - 6, y: 4, z: -2}, {x: stage1X, z: 0, duration: 2, ease: "power2.inOut"}, "stage1");
masterTl.to(particleA.position, {y: 0, duration: 2, ease: "bounce.out"}, "stage1"); // 不規則跳動感
// B: 右下
masterTl.fromTo(particleB.position, {x: stage1X + 6, y: -4, z: 2}, {x: stage1X, z: 0, duration: 2, ease: "power2.inOut"}, "stage1");
masterTl.to(particleB.position, {y: 0, duration: 2, ease: "elastic.out(1, 0.5)"}, "stage1"); // 彈性路徑

// 融合
masterTl.to([particleA.material, particleB.material], { opacity: 0, duration: 0.1 }, "stage1+=1.9");
masterTl.to(zygoteGroup.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(2)" }, "stage1+=1.9");
masterTl.to('.stage-1 .char', { opacity: 0, y: -50, stagger: 0.01 }, "stage1+=2.5");

// [ 階段 2：漂流 (跟隨相機前往岩石) ]
masterTl.addLabel("stage2", "stage1+=3");
masterTl.to('.stage-2 .char', { opacity: 1, y: 0, stagger: 0.02 }, "stage2");

// 相機與受精卵一起往右移至 X=60
masterTl.to(cameraRig.position, { x: stage3X, duration: 4, ease: "none" }, "stage2");
masterTl.to(zygoteGroup.position, { x: stage3X, duration: 4, ease: "none" }, "stage2");

// ★ 漂流的波浪曲線 (Sine Wave)
masterTl.to(zygoteGroup.position, { y: 2, duration: 1, ease: "sine.inOut", yoyo: true, repeat: 3 }, "stage2");
masterTl.to('.stage-2 .char', { opacity: 0, y: -50 }, "stage2+=3.5");

// [ 階段 3：停留 (附著與生長) ]
masterTl.addLabel("stage3", "stage2+=4");
masterTl.to('.stage-3 .char', { opacity: 1, y: 0, stagger: 0.02 }, "stage3");

// 受精卵降落到岩石表面
masterTl.to(zygoteGroup.position, { y: -1.2, duration: 1, ease: "power2.in" }, "stage3");
masterTl.to(zygoteGroup.scale, { x: 0, y: 0, z: 0, duration: 0.2 }, "stage3+=1");

// 水螅體長出
masterTl.to(polypGroup.scale, { x: 1, y: 1, z: 1, duration: 1, ease: "back.out(1.2)" }, "stage3+=1");
masterTl.fromTo(tentacles.scale, {x:0,y:0,z:0}, { x: 1, y: 1, z: 1, duration: 1 }, "stage3+=1.5");

masterTl.to(tentacles.scale, { x: 0, y: 0, z: 0, duration: 0.5 }, "stage3+=2.5");
/*// ★ 橫裂化 (Strobilation) 動畫：觸手吸收，身體拉長，碟狀體從身體頂部浮現
masterTl.to(tentacles.scale, { x: 0, y: 0, z: 0, duration: 0.5 }, "stage3+=2.5");
masterTl.to(stalk.scale, { y: 1.6, duration: 1.5, ease: "power1.inOut" }, "stage3+=2.5");

const ephyraBirth = "stage3+=3.8"; // 微微提前，消除割裂感
ephyraeStars.forEach((star, index) => {
    // 依序出現並從柄上彈射 (模擬)
    masterTl.to(star.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: "back.out(1.5)" }, `${ephyraBirth}+=${index * 0.1}`);
});*/

const strobStartTime = "stage3+=2.5"; // 定義橫裂化開始的時間點

// 3. 身體拉長 (Stalk Elongation)
masterTl.to(stalk.scale, { 
    y: 1.6, 
    duration: 4, 
    ease: "power1.inOut" 
}, strobStartTime);

// 4. 碟狀幼體隨著身體拉長，節節長出
ephyraeStars.forEach((star, index) => {
    masterTl.to(star.scale, { 
        x: 1, y: 1, z: 1, 
        duration: 0.8, 
        ease: "power2.out" 
    }, `${strobStartTime}+=${index * 0.7}`); // 每隔 0.3 秒長出一層，模擬節節升高的動態
});

masterTl.to('.stage-3 .char', { opacity: 0, y: -50 }, "stage3+=7.5");

// [ 階段 4：誕生 (碟狀幼體剝離) ]
masterTl.addLabel("stage4", "stage3+=8");
masterTl.to('.stage-4 .char', { opacity: 1, y: 0, stagger: 0.02 }, "stage4");

masterTl.to(stalk.material, { opacity: 0.3, duration: 0.5 }, "stage4");

// ★ 幼體由頂層「由上往下」逐一剝離並游走
const starCount = ephyraeStars.length;
// 柄的縮短量 (總高度 1.6 -> 附著後的基準高度 0.8)
const stalkShortenOffset = (1.6 - 0.8) / starCount;

ephyraeStars.forEach((star, index) => {
    // 反向索引：最後一個元素（最上面的盤子）最先剝離
    const reverseIndex = starCount - 1 - index; 
    const triggerTime = `stage4+=${index * 0.4}`; // 間隔 0.4 秒剝離一個

    // 向上彈射與散開
    masterTl.to(ephyraeStars[reverseIndex].position, { 
        y: "+=12", // 飄更高
        x: "+=" + ((Math.random() - 0.5) * 40), // 散更開
        z: "+=" + ((Math.random() - 0.5) * 8),
        duration: 3.5, 
        ease: "power1.out" 
    }, triggerTime);
    
    // 旋轉
    masterTl.to(ephyraeStars[reverseIndex].rotation, { 
        y: Math.PI * 4, 
        z: Math.PI * 2, 
        duration: 3.5, 
        ease: "power1.inOut" 
    }, triggerTime);
    
    // 模擬水母「一縮一放」的游泳動作
    masterTl.to(ephyraeStars[reverseIndex].scale, { 
        x: 1.4, y: 1.4, duration: 0.4, yoyo: true, repeat: 5 
    }, triggerTime);
    // 碟狀體原本疊加高度為 i * 0.2，柄的高度跟著同步下降
    const newStalkScale = 1.6 - stalkShortenOffset * (index + 1);
    masterTl.to(stalk.scale, { y: newStalkScale, duration: 0.3, ease: "power2.inOut" }, triggerTime);
});

// --- 6. 滑鼠互動與動畫循環 ---
let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5);
    mouseY = -(e.clientY / window.innerHeight - 0.5);
});

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;
    
    bubblesMaterial.uniforms.uTime.value = time;
    // 讓燈光永遠跟著相機滑軌，確保每個階段都有打光
    pLight.position.set(cameraRig.position.x + 2, 4, 5);

    // 視差微動：套用在相機本體上，不影響滑軌的 X 軸大移動
    camera.position.x += (mouseX * 1 - camera.position.x) * 0.05;
    camera.position.y += (-mouseY * 1 - camera.position.y) * 0.05;
    camera.lookAt(cameraRig.position.x, 0, 0); // 相機本地對焦

    // 碟狀幼體如果出現了，讓它們有微小呼吸感
    ephyraeStars.forEach(star => {
        // 加入條件判斷：只在「已長大 ( > 0.5 )」且「還沒開始劇烈游泳 ( < 1.2 )」的狀態下套用呼吸感
        // 這樣就能完美避開 GSAP 第四階段 (放大到 1.3) 的游泳動畫衝突！
        if (star.scale.x > 0.5 && star.scale.x < 1.2) {
            star.scale.x = 1 + Math.sin(time * 3) * 0.05;
            star.scale.y = 1 + Math.sin(time * 3) * 0.05;
        }
    });

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 在 Stage 4 剝離動畫結束後 (假設大約在 stage4+=3.5 的位置)
// --- 最終轉場：區塊二退場 -> 區塊三進場 ---

// 定義區塊二退場的時間點
const stage2ExitTime = "stage4+=3.5"; 
// 稍微拉長等待時間，確保區塊二完全消失清空
const section3InTime = stage2ExitTime + "+=3.5"; 

// 1. 【重點修正】區塊二退場：不只處理 stage-4，而是確保所有之前的文字特效層都被清空
masterTl.to(['.stage-1', '.stage-2', '.stage-3', '.stage-4', '#webgl-canvas'], { 
    x: +2000,
    //y: -50,             // 向上飄走增加動態感
    autoAlpha: 0,       // autoAlpha 會同時處理 opacity:0 和 visibility:hidden，防止殘留文字擋住點擊
    duration: 0.8,
    ease: "power2.in",
    stagger: 0.1        // 讓文字一組組消失
}, stage2ExitTime);

// 2. 3D 物件加速退場
masterTl.to([rock.position, polypGroup.position, stalk.position], {
    x: "-=200",          
    opacity: 0,
    duration: 1.5,
    ease: "power2.in"
}, stage2ExitTime);

masterTl.to('#hero-jellyfish-container', { 
    autoAlpha: 0, 
    duration: 1 
}, stage2ExitTime);

// 3. 區塊三進場：氣泡區塊「浮現」
masterTl.to('#bubbleSection', {
    onStart: () => {
        const el = document.getElementById('bubbleSection');
        if (el) {
            el.classList.add('active');
            el.style.pointerEvents = 'auto'; // 確保可以點擊
        }
    },
    autoAlpha: 1, // 使用 autoAlpha 確保進場後 visibility 為 visible
    duration: 1.8,
    ease: "power2.inOut"
}, section3InTime);

// 4. 氣泡卡片登場（稍微調整延遲，讓畫面更乾淨）
document.querySelectorAll('.bubble-card').forEach((card, i) => {
    masterTl.fromTo(card, 
        { y: 100, opacity: 0, scale: 0.8 },
        { 
            y: 0, 
            opacity: 1, 
            scale: 1, 
            duration: 1.5, 
            ease: "back.out(1.4)" 
        }, 
        `${section3InTime}+=${0.5 + i * 0.3}` // 增加間隔
    );
});

// --- 彈窗功能函式 (放在 Timeline 外部) ---
window.showJellyDetail = function(imgSrc, title, desc) {
    const modal = document.getElementById('circleModal');
    const modalImg = document.getElementById('modalImg');
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');

    if(modalImg) modalImg.src = imgSrc;
    if(modalTitle) modalTitle.innerText = title;
    if(modalDesc) modalDesc.innerText = desc;

    modal.style.display = 'flex';
}

window.closeCircleModal = function() {
    const modal = document.getElementById('circleModal');
    if(modal) modal.style.display = 'none';
}