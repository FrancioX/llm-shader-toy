#define t iTime/4.0

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
	vec2 p = (2.0*fragCoord.xy-iResolution.xy)/iResolution.y;
	vec2 mp = iMouse.xy/iResolution.xy*0.5+0.5;
		
	float s = 1.0;
	for (int i=0; i < 7; i++) {
		s = max(s,abs(p.x)-0.375);
		p = abs(p*2.25)-mp*1.25;
		p *= mat2(cos(t+mp.x),-sin(t+mp.y),sin(t+mp.y),cos(t+mp.x));
	}
	
	vec3 col = vec3(4.0,2.0,1.0)/abs(atan(p.y,p.x))/s;
	
	fragColor = vec4(col,1.0);
}