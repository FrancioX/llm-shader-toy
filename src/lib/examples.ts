import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { convertShaderToyToWebGL2 } from './ShaderConverter';

export function generateExamplesFile() {
    const examplesDir = join(process.cwd(), 'shaders/examples');
    let examplesText = '';
    let successCount = 0;
    let failureCount = 0;

    try {
        console.log('Generating shader examples file...');
        console.log(`Reading examples from: ${examplesDir}`);

        // Get all files in the examples directory
        const files = readdirSync(examplesDir);
        
        // Find all unique prefixes (ex_1, ex_2, etc.)
        const prefixes = new Set(
            files.map(file => file.split('.')[0]) // Get filename without extension
        );

        console.log(`Found ${prefixes.size} potential examples`);

        // Process each prefix
        for (const prefix of prefixes) {
            const descFile = `${prefix}.txt`;
            const codeFile = `${prefix}.glsl`;

            // Skip if we don't have both files
            if (!files.includes(descFile) || !files.includes(codeFile)) {
                console.warn(`Skipping incomplete example ${prefix}: missing ${!files.includes(descFile) ? 'description' : 'code'} file`);
                failureCount++;
                continue;
            }

            try {
                const description = readFileSync(join(examplesDir, descFile), 'utf-8').trim();
                const shaderToyCode = readFileSync(join(examplesDir, codeFile), 'utf-8').trim();

                // Convert ShaderToy code to WebGL 2.0
                const result = convertShaderToyToWebGL2(shaderToyCode);
                if (result.err) {
                    console.error(`Failed to convert example ${prefix}:`, result.val);
                    failureCount++;
                    continue;
                }

                const webGL2Code = result.unwrap();

                // Extract example number from prefix (e.g., "ex_1" -> "1")
                const exampleNum = prefix.split('_')[1];

                // Add to examples text
                examplesText += `Example ${exampleNum}\n----\nDescription: ${description}\n\nCode:\n${webGL2Code}\n\n`;
                successCount++;
                console.log(`✓ Successfully processed example ${prefix}`);
            } catch (err) {
                console.error(`Error processing example ${prefix}:`, err);
                failureCount++;
            }
        }

        // Write to file
        const outputPath = join(process.cwd(), 'shader_examples.txt');
        writeFileSync(outputPath, examplesText);
        console.log('\nExamples generation summary:');
        console.log(`✓ Successfully processed: ${successCount} examples`);
        if (failureCount > 0) {
            console.log(`✗ Failed to process: ${failureCount} examples`);
        }
        console.log(`\nExamples file generated at: ${outputPath}`);
    } catch (err) {
        console.error('Failed to generate examples file:', err);
    }
} 