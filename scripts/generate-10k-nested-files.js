const fs = require('fs');
const path = require('path');

// Configuration
const TOTAL_FILES = 10000;
const ROOT_DIR = './test_files';
const MIN_DEPTH = 1;
const MAX_DEPTH = 8;

// Generate random folder names
const folderNames = [
    'documents', 'images', 'data', 'reports', 'archive', 'backup', 'temp', 'logs',
    'config', 'assets', 'resources', 'uploads', 'downloads', 'cache', 'exports',
    'imports', 'projects', 'samples', 'templates', 'scripts', 'tools', 'utils',
    'media', 'content', 'files', 'storage', 'shared', 'private', 'public'
];

// Generate random file names
const fileWords = [
    'report', 'document', 'data', 'summary', 'analysis', 'log', 'config', 'note',
    'memo', 'draft', 'final', 'backup', 'copy', 'template', 'sample', 'test',
    'output', 'input', 'result', 'export', 'import', 'temp', 'cache', 'archive'
];

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomDepth() {
    return Math.floor(Math.random() * (MAX_DEPTH - MIN_DEPTH + 1)) + MIN_DEPTH;
}

function generateRandomPath(depth) {
    const pathParts = [ROOT_DIR];
    
    for (let i = 0; i < depth; i++) {
        const folderName = getRandomElement(folderNames);
        const suffix = Math.floor(Math.random() * 100);
        pathParts.push(`${folderName}_${suffix}`);
    }
    
    return pathParts.join(path.sep);
}

function generateRandomFileName() {
    const word1 = getRandomElement(fileWords);
    const word2 = getRandomElement(fileWords);
    const number = Math.floor(Math.random() * 9999);
    return `${word1}_${word2}_${number}.txt`;
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function createFile(filePath) {
    const content = `This is test file: ${path.basename(filePath)}\nCreated at: ${new Date().toISOString()}\nPath: ${filePath}`;
    fs.writeFileSync(filePath, content);
}

function main() {
    console.log(`Creating ${TOTAL_FILES} files in nested directories...`);
    console.log(`Root directory: ${ROOT_DIR}`);
    console.log(`Depth range: ${MIN_DEPTH} to ${MAX_DEPTH} levels`);
    
    // Clean up existing directory if it exists
    if (fs.existsSync(ROOT_DIR)) {
        console.log('Removing existing directory...');
        fs.rmSync(ROOT_DIR, { recursive: true, force: true });
    }
    
    // Create root directory
    fs.mkdirSync(ROOT_DIR);
    
    const depthStats = {};
    const startTime = Date.now();
    
    for (let i = 0; i < TOTAL_FILES; i++) {
        const depth = getRandomDepth();
        const dirPath = generateRandomPath(depth);
        const fileName = generateRandomFileName();
        const filePath = path.join(dirPath, fileName);
        
        // Track depth statistics
        depthStats[depth] = (depthStats[depth] || 0) + 1;
        
        // Ensure directory exists
        ensureDirectoryExists(dirPath);
        
        // Create the file
        createFile(filePath);
        
        // Progress indicator
        if ((i + 1) % 1000 === 0) {
            console.log(`Created ${i + 1}/${TOTAL_FILES} files...`);
        }
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n✅ File generation complete!');
    console.log(`⏱️  Total time: ${duration.toFixed(2)} seconds`);
    console.log('\n📊 Distribution by depth:');
    
    for (let depth = MIN_DEPTH; depth <= MAX_DEPTH; depth++) {
        const count = depthStats[depth] || 0;
        const percentage = ((count / TOTAL_FILES) * 100).toFixed(1);
        console.log(`   ${depth} levels: ${count} files (${percentage}%)`);
    }
    
    // Count actual directories created
    function countDirs(dir) {
        let count = 0;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                count++;
                count += countDirs(fullPath);
            }
        }
        return count;
    }
    
    const totalDirs = countDirs(ROOT_DIR);
    console.log(`\n📁 Total directories created: ${totalDirs}`);
    console.log(`📄 Total files created: ${TOTAL_FILES}`);
}

// Run the script
main();