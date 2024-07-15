(function(window) {
	var Blob = function(size, sizeMax, cfg)
	{
		this.initialize(size, sizeMax, cfg);
	}
	var p = Blob.prototype = new Shape();
	//
	p.cfg;
	p.size;
	p.sizeMax;
	p.anglePerCell;
	p.points;
	p.offsets;
	p.radiiMax;
	p.angle = 0;
	//
	p.initialize = function(size, sizeMax, cfg)
	{
		Shape.prototype.initialize.apply(this);
		this.size = size;
		this.sizeMax = sizeMax;
		this.cfg = cfg;
		//
		this.radiiMax =  [];
		this.setEllipseRatio(1);
		this.anglePerCell = (Math.PI * 2) / this.cfg.resolution;
		this.offsets = [];
		this.points = [];
		this.pointsOrig = [];
		for (var i = 0; i < this.cfg.resolution; i++)
		{
			this.offsets[i] = 0;
			this.points[i] = new Point(this.size, i * this.anglePerCell);
			this.pointsOrig[i] = new Point(this.size, i * this.anglePerCell);
		}
		this._draw();
	}
	
	p.setEllipseRatio = function(r)
	{
		//r is ratio width/height
		//use form of superellipse to determine max bounds of blob points
		var rx = this.sizeMax * (r > 1 ? r : 1);
		var ry = this.sizeMax * (r < 1 ? 1/r : 1);
		var n = 4;//determines 'superness' of ellipse (higher = more rectangular)
		for (var i = 0; i < this.cfg.resolution; i++)
		{
			var a = i * this.anglePerCell;
			var a2 = Math.atan(Math.pow(Math.abs(Math.tan(a) * rx / ry), n/2));//angle of origin to intersection of vector with angle a and superellipse. Along lines of http://mathforum.org/library/drmath/view/54922.html, but for parametric equations of superellipse.
			//get point on superellipse (http://en.wikipedia.org/wiki/Superellipse)
			var x = Math.pow(Math.abs(Math.cos(a2)), 2/n) * rx * MathUtil.sgn(Math.cos(a2));
			var y = Math.pow(Math.abs(Math.sin(a2)), 2/n) * ry * MathUtil.sgn(Math.sin(a2));
			var len = Math.sqrt(x * x + y * y);
			this.radiiMax[i] = len;
		}
	}
	
	p.rotate = function(radians)
	{
		this.angle = (this.angle + radians) % (Math.PI * 2);
		if (this.angle < 0) this.angle += Math.PI * 2;
	}
	
	/**
	 * Get amount of activity in blob
	 * Measured by average of absolute offsets
	 */
	p.getActivity = function()
	{
		var sum = 0;
		for (var i = 0; i < this.offsets.length; ++i)
		{
			sum += Math.abs(this.offsets[i]);
		}
		return sum/this.offsets.length;
	}
		
	/**
	 * Set activity of blob.
	 * Scales offsets to achieve specified activity.
	 */
	p.setActivity = function(value)
	{
		var skip = 6;
		var c = this.cfg.resolution / skip;
		var n = this.offsets.length;
		var current = this.getActivity();
		//console.log(current);
		if (current == 0)
		{
			//for (var i = 0; i < c; i++) this.offsets[Math.floor(Math.random() * n)] = value/c;
			for (var i = 0; i < this.offsets.length; i++)
			{
				this.offsets[i] = Math.random() * value - .5*value;
			}
			var pool = [];
			for (var j = 0; j < this.offsets.length; j++) pool.push(j);
			for (var i = 0; i < c; i++)
			{
				var index = pool.splice(Math.random() * pool.length, 1)[0];
				this.offsets[index] = value/c;
			}
		}
		else
		{
			//NB: .8 is just an experiental value
			var factor = .8 * value / current;
			for (var i = 0; i < n; i++) this.offsets[i] *= factor;
			//and apply some randomness
			for (var i = 0; i < c; i++)
			{
				var r = Math.floor(Math.random() * skip);//0,1 or 2
				if (i*skip + r<n) this.offsets[i*skip + r] *= factor;
			}
		}
	}
	
	p.update = function()
	{
		//update cells: recalc offsets, offset points
		//calc new vertical offsets for all cols and apply damping
		for (var i = 0; i < this.points.length; ++i)
		{
			var iPrev = (i - 1 + this.points.length) % this.points.length;
			var iNext = (i + 1) % this.points.length;
			var d = this.points[iNext].x + this.points[iPrev].x - 2 * this.points[i].x;
			this.offsets[i] = (this.offsets[i] + d / this.cfg.delay) * this.cfg.damping;
			if (Math.abs(this.offsets[i]) < 0.001) this.offsets[i] = 0;
		}
		//apply offsets and more damping
		for (i = 0; i < this.points.length; ++i)
		{
			this.points[i].x += this.offsets[i];
			this.offsets[i] = (this.offsets[i] + (this.pointsOrig[i].x-this.points[i].x) * this.cfg.damping2);
			this.points[i].x = Math.min(Math.max(this.points[i].x, 10), this.radiiMax[i]);//bound
		}
		//render
		this._draw();
	}
		
	p.addWave = function(polarPos, polarSpeed)
	{
		//index is cell where wave should be added
		var index = (Math.round((polarPos.y-this.angle) / this.anglePerCell) + this.points.length) % this.points.length;
		//calc offset for top of wave
		var offsetBase = polarSpeed.x;
		var waveRange = Math.ceil(this.cfg.neighbourFactor * Math.abs(polarSpeed.x) / 20);
		var randomMargin = Math.abs(polarSpeed.x * this.cfg.randomFactor) + this.cfg.randomBase;//for irregularity in shape
		for (var i = 0; i < this.points.length; ++i)
		{
			var dist = Math.abs(i - index);//cell distance
			//factor: linearly from -.5*pi to .5*pi
			var factor = Math.max((waveRange - dist) / waveRange, 0) * Math.PI - .5 * Math.PI;
			var factorSin = (Math.sin(factor) + 1 ) / 2;//sin -1 .. 1 --> + 1 / 2 : 0..1
			var rnd = Math.random() * randomMargin - randomMargin / 2;
			var d = (offsetBase * factorSin + rnd) * (this.size / 300);
			this.offsets[i] += d;
		}
	}
	

	p._draw = function()
	{
		//convert polar coordinates to cartesian
		//  and determine bounding box of shape for gradient fill
		var ps = [];
		var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
		for (var i = 0; i < this.points.length; i++)
		{
			ps[i] = GeomUtil.polarToCartesian(this.points[i].x, this.points[i].y + this.angle);
			minx = Math.min(minx, ps[i].x);
			maxx = Math.max(maxx, ps[i].x);
			miny = Math.min(miny, ps[i].y);
			maxy = Math.max(maxy, ps[i].y);
		}
		var rect = new Rectangle(minx,miny,maxx-minx,maxy-miny);
		//
		var f = this.cfg.ellipseFactor;
		var g = this.graphics;
		g.clear();
		if (this.cfg.strokeWidth>0) g.setStrokeStyle(this.cfg.strokeWidth).beginStroke(this.cfg.strokeColor);
		g.beginFill(this.cfg.fillColor);
		for (i = 0; i < ps.length; i++)
		{
			var iPrev = (i - 1 + ps.length) % ps.length;
			var iNext = (i + 1) % ps.length;
			var pFrom = new Point((ps[iPrev].x + ps[i].x) / 2, (ps[iPrev].y + ps[i].y) / 2);
			var pTo = new Point((ps[iNext].x + ps[i].x) / 2, (ps[iNext].y + ps[i].y) / 2);
			var c = new Point(ps[i].x, ps[i].y);
			if (i == 0) g.moveTo(pFrom.x*f, pFrom.y);
			g.curveTo(c.x*f, c.y, pTo.x*f, pTo.y);
		}
		g.endFill();
	}
		
	window.Blob = Blob;
}(window));