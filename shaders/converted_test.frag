#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
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

void main() {
    vec3 c;
    float l,z=iTime;
    for(int i=0;i<3;i++) {
        vec2 uv,p=gl_FragCoord.xy/iResolution.xy;
        uv=p;
        p-=.5;
        p.x*=iResolution.x/iResolution.y;
        z+=.07;
        l=length(p);
        uv+=p/l*(sin(z)+1.)*abs(sin(l*9.-z-z));
        c[i]=.01/length(mod(uv,1.)-.5);
    }
    out_color=vec4(c/l,iTime);
} 