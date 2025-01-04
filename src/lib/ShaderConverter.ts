import { Result, Ok, Err } from 'ts-results-es';

export function convertShaderToyToWebGL2(shaderToyCode: string): Result<string, string> {
    if (!shaderToyCode) {
        return new Err('Input shader code is empty');
    }

    try {
        // Add WebGL 2.0 header
        let webGL2Code = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_mouse;
uniform vec4 u_mouse_button;
uniform sampler2D u_buffer0;
uniform sampler2D u_buffer1;
uniform sampler2D u_buffer2;
uniform sampler2D u_buffer3;

out vec4 out_color;

// ShaderToy compatibility
#define iResolution u_resolution
#define iTime u_time
#define iMouse u_mouse
#define iMouseButton u_mouse_button
#define iChannel0 u_buffer0
#define iChannel1 u_buffer1
#define iChannel2 u_buffer2
#define iChannel3 u_buffer3

`;
        let processedCode = shaderToyCode;

        // Extract and process defines
        const defineRegex = /#define\s+(\w+)\s+(\w+(?:\.\w+)?)/g;
        const defines = new Map();
        let match;
        while ((match = defineRegex.exec(shaderToyCode)) !== null) {
            defines.set(match[1], match[2]);
        }

        // Remove all defines from the code
        processedCode = processedCode.replace(/#define.*\n/g, '');

        // Replace mainImage function with main
        const mainImageRegex = /void\s+mainImage\s*\(\s*out\s+vec4\s+fragColor\s*,\s*in\s+vec2\s+fragCoord\s*\)/;
        if (!mainImageRegex.test(processedCode)) {
            return new Err('Input shader does not contain a valid mainImage function');
        }

        processedCode = processedCode.replace(mainImageRegex, 'void main() ');

        // Replace fragColor assignments with out_color
        processedCode = processedCode.replace(/fragColor(?=\s*=)/g, 'out_color');

        // Replace fragCoord with gl_FragCoord
        processedCode = processedCode.replace(/fragCoord/g, 'gl_FragCoord');

        // Replace defined variables
        defines.forEach((value, key) => {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            if (value === 'iTime') {
                processedCode = processedCode.replace(regex, 'iTime');
            } else if (value === 'iResolution.xy') {
                processedCode = processedCode.replace(regex, 'iResolution.xy');
                // Also fix any .x/.y access on the replaced variable
                processedCode = processedCode.replace(/iResolution\.xy\.x/g, 'iResolution.x');
                processedCode = processedCode.replace(/iResolution\.xy\.y/g, 'iResolution.y');
            }
        });

        // Fix indentation
        const lines = processedCode.split('\n');
        let indentLevel = 0;
        const indentedLines = lines.map(line => {
            line = line.trim();
            if (line.includes('}')) {
                indentLevel--;
            }
            const indent = '    '.repeat(Math.max(0, indentLevel));
            if (line.includes('{')) {
                indentLevel++;
            }
            return line ? indent + line : line;
        });
        processedCode = indentedLines.join('\n');
        
        // Clean up extra newlines and spaces
        processedCode = processedCode.replace(/\n\s*\n\s*\n/g, '\n\n');
        processedCode = processedCode.trim();

        webGL2Code += processedCode;

        return new Ok(webGL2Code);
    } catch (err) {
        const error = err as Error;
        return new Err(`Failed to convert shader: ${error.message}`);
    }
} 