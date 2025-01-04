import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertShaderToyToWebGL2 } from '../lib/ShaderConverter.js';

// Get the directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

try {
    // Read the input shader
    const inputPath = join(__dirname, '../../shaders/st_test.frag');
    let shaderToyCode;
    try {
        shaderToyCode = readFileSync(inputPath, 'utf-8');
    } catch (err) {
        const error = err as Error;
        console.error(`Error reading input file ${inputPath}:`, error.message);
        process.exit(1);
    }

    // Read the expected output
    const expectedPath = join(__dirname, '../../shaders/converted_test.frag');
    let expectedCode;
    try {
        expectedCode = readFileSync(expectedPath, 'utf-8');
    } catch (err) {
        const error = err as Error;
        console.error(`Error reading expected output file ${expectedPath}:`, error.message);
        process.exit(1);
    }

    // Convert the shader
    const result = convertShaderToyToWebGL2(shaderToyCode);

    if (result.unwrap) {
        // Compare with expected output
        const convertedCode = result.unwrap();
        
        // Normalize line endings and whitespace
        const normalizedConverted = convertedCode.replace(/\r\n/g, '\n').trim();
        const normalizedExpected = expectedCode.replace(/\r\n/g, '\n').trim();
        
        if (normalizedConverted === normalizedExpected) {
            console.log('✅ Test passed! Conversion matches expected output.');
        } else {
            console.error('❌ Test failed! Conversion does not match expected output.\n');
            console.error('Input shader:');
            console.error('=============');
            console.error(shaderToyCode);
            console.error('\nExpected output:');
            console.error('================');
            console.error(expectedCode);
            console.error('\nActual output:');
            console.error('==============');
            console.error(convertedCode);
            console.error('\nDifferences found:');
            console.error('Expected length:', normalizedExpected.length);
            console.error('Received length:', normalizedConverted.length);
            // Log the first difference found
            for (let i = 0; i < Math.min(normalizedExpected.length, normalizedConverted.length); i++) {
                if (normalizedExpected[i] !== normalizedConverted[i]) {
                    console.error(`\nFirst difference at position ${i}:`);
                    console.error('Expected:', normalizedExpected.slice(i, i + 50));
                    console.error('Received:', normalizedConverted.slice(i, i + 50));
                    break;
                }
            }
            process.exit(1);
        }
    } else {
        console.error('Failed to convert shader:', result.unwrapErr());
        process.exit(1);
    }
} catch (err) {
    const error = err as Error;
    console.error('Unexpected error:', error.message);
    process.exit(1);
} 