
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || (anchor && node.nextSibling !== anchor)) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_svg_attributes(node, attributes) {
        for (const key in attributes) {
            attr(node, key, attributes[key]);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.38.3' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* node_modules\svelte-c-reveal\src\Reveal.svelte generated by Svelte v3.38.3 */
    const file$6 = "node_modules\\svelte-c-reveal\\src\\Reveal.svelte";

    function create_fragment$6(ctx) {
    	let div1;
    	let div0;
    	let div0_class_value;
    	let rev_action;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[8].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[7], null);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			attr_dev(div0, "class", div0_class_value = "" + (null_to_empty("hide svelte-c-reveal " + /*cssClass*/ ctx[4]) + " svelte-19ttgh6"));
    			add_location(div0, file$6, 263, 4, 5941);
    			attr_dev(div1, "class", "wrapper svelte-19ttgh6");
    			add_location(div1, file$6, 258, 0, 5783);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					action_destroyer(rev_action = /*rev*/ ctx[5].call(null, div1, {
    						duration: /*duration*/ ctx[0],
    						delay: /*delay*/ ctx[1]
    					})),
    					listen_dev(div1, "in", /*in_handler*/ ctx[9], false, false, false),
    					listen_dev(div1, "out", /*out_handler*/ ctx[10], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 128)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[7], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*cssClass*/ 16 && div0_class_value !== (div0_class_value = "" + (null_to_empty("hide svelte-c-reveal " + /*cssClass*/ ctx[4]) + " svelte-19ttgh6"))) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (rev_action && is_function(rev_action.update) && dirty & /*duration, delay*/ 3) rev_action.update.call(null, {
    				duration: /*duration*/ ctx[0],
    				delay: /*delay*/ ctx[1]
    			});
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Reveal", slots, ['default']);
    	let { trigger = 0 } = $$props;
    	let { duration = 0.4 } = $$props;
    	let { delay = 0 } = $$props;
    	let { reveal = "fadeIn" } = $$props;
    	let { hide = "" } = $$props;
    	let cssClass = "";

    	// Action -----------------
    	function rev(node, args) {
    		let revealNode = node.querySelector(".svelte-c-reveal");
    		revealNode.style.setProperty("--animation-delay", args.delay + "s");
    		revealNode.style.setProperty("--animation-duration", args.duration + "s");

    		// Anim settings
    		const handler = (entries, observer) => {
    			entries.forEach(entry => {
    				if (entry.isIntersecting) {
    					entry.target.dispatchEvent(new CustomEvent("in"));

    					if (hide === "") {
    						observer.disconnect();
    					}
    				} else {
    					if (hide !== "") {
    						entry.target.dispatchEvent(new CustomEvent("out"));
    					}
    				}
    			});
    		};

    		let _trigger = 100 * trigger;

    		const observer = new IntersectionObserver(handler,
    		{
    				root: null,
    				rootMargin: `0% 0% -${_trigger}% 0%`,
    				threshold: 0
    			});

    		// Observe
    		observer.observe(node);

    		// Return
    		return {
    			destroy(observer) {
    				observer.disconnect();
    			}
    		};
    	}

    	const writable_props = ["trigger", "duration", "delay", "reveal", "hide"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Reveal> was created with unknown prop '${key}'`);
    	});

    	const in_handler = e => $$invalidate(4, cssClass = reveal);
    	const out_handler = e => $$invalidate(4, cssClass = hide);

    	$$self.$$set = $$props => {
    		if ("trigger" in $$props) $$invalidate(6, trigger = $$props.trigger);
    		if ("duration" in $$props) $$invalidate(0, duration = $$props.duration);
    		if ("delay" in $$props) $$invalidate(1, delay = $$props.delay);
    		if ("reveal" in $$props) $$invalidate(2, reveal = $$props.reveal);
    		if ("hide" in $$props) $$invalidate(3, hide = $$props.hide);
    		if ("$$scope" in $$props) $$invalidate(7, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		trigger,
    		duration,
    		delay,
    		reveal,
    		hide,
    		cssClass,
    		rev
    	});

    	$$self.$inject_state = $$props => {
    		if ("trigger" in $$props) $$invalidate(6, trigger = $$props.trigger);
    		if ("duration" in $$props) $$invalidate(0, duration = $$props.duration);
    		if ("delay" in $$props) $$invalidate(1, delay = $$props.delay);
    		if ("reveal" in $$props) $$invalidate(2, reveal = $$props.reveal);
    		if ("hide" in $$props) $$invalidate(3, hide = $$props.hide);
    		if ("cssClass" in $$props) $$invalidate(4, cssClass = $$props.cssClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		duration,
    		delay,
    		reveal,
    		hide,
    		cssClass,
    		rev,
    		trigger,
    		$$scope,
    		slots,
    		in_handler,
    		out_handler
    	];
    }

    class Reveal extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			trigger: 6,
    			duration: 0,
    			delay: 1,
    			reveal: 2,
    			hide: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Reveal",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get trigger() {
    		throw new Error("<Reveal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set trigger(value) {
    		throw new Error("<Reveal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get duration() {
    		throw new Error("<Reveal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<Reveal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get delay() {
    		throw new Error("<Reveal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set delay(value) {
    		throw new Error("<Reveal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get reveal() {
    		throw new Error("<Reveal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set reveal(value) {
    		throw new Error("<Reveal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hide() {
    		throw new Error("<Reveal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hide(value) {
    		throw new Error("<Reveal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    		path: basedir,
    		exports: {},
    		require: function (path, base) {
    			return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
    		}
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var name = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateIcon = exports.stringToIcon = void 0;
    /**
     * Expression to test part of icon name.
     */
    const match = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    /**
     * Convert string to Icon object.
     */
    const stringToIcon = (value, validate, allowSimpleName) => {
        let provider = '';
        const colonSeparated = value.split(':');
        // Check for provider with correct '@' at start
        if (value.slice(0, 1) === '@') {
            // First part is provider
            if (colonSeparated.length < 2 || colonSeparated.length > 3) {
                // "@provider:prefix:name" or "@provider:prefix-name"
                return null;
            }
            provider = colonSeparated.shift().slice(1);
        }
        // Check split by colon: "prefix:name", "provider:prefix:name"
        if (colonSeparated.length > 3 || !colonSeparated.length) {
            return null;
        }
        if (colonSeparated.length > 1) {
            // "prefix:name"
            const name = colonSeparated.pop();
            const prefix = colonSeparated.pop();
            const result = {
                // Allow provider without '@': "provider:prefix:name"
                provider: colonSeparated.length > 0 ? colonSeparated[0] : provider,
                prefix,
                name,
            };
            return validate && !exports.validateIcon(result) ? null : result;
        }
        // Attempt to split by dash: "prefix-name"
        const name = colonSeparated[0];
        const dashSeparated = name.split('-');
        if (dashSeparated.length > 1) {
            const result = {
                provider: provider,
                prefix: dashSeparated.shift(),
                name: dashSeparated.join('-'),
            };
            return validate && !exports.validateIcon(result) ? null : result;
        }
        // If allowEmpty is set, allow empty provider and prefix, allowing names like "home"
        if (allowSimpleName && provider === '') {
            const result = {
                provider: provider,
                prefix: '',
                name,
            };
            return validate && !exports.validateIcon(result, allowSimpleName)
                ? null
                : result;
        }
        return null;
    };
    exports.stringToIcon = stringToIcon;
    /**
     * Check if icon is valid.
     *
     * This function is not part of stringToIcon because validation is not needed for most code.
     */
    const validateIcon = (icon, allowSimpleName) => {
        if (!icon) {
            return false;
        }
        return !!((icon.provider === '' || icon.provider.match(match)) &&
            ((allowSimpleName && icon.prefix === '') || icon.prefix.match(match)) &&
            icon.name.match(match));
    };
    exports.validateIcon = validateIcon;
    });

    var merge_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.merge = void 0;
    /**
     * Merge two objects
     *
     * Replacement for Object.assign() that is not supported by IE, so it cannot be used in production yet.
     */
    function merge(item1, item2, item3) {
        const result = Object.create(null);
        const items = [item1, item2, item3];
        for (let i = 0; i < 3; i++) {
            const item = items[i];
            if (typeof item === 'object' && item) {
                for (const key in item) {
                    const value = item[key];
                    if (value !== void 0) {
                        result[key] = value;
                    }
                }
            }
        }
        return result;
    }
    exports.merge = merge;
    });

    var icon = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fullIcon = exports.iconDefaults = void 0;

    /**
     * Default values for IconifyIcon properties
     */
    exports.iconDefaults = Object.freeze({
        body: '',
        left: 0,
        top: 0,
        width: 16,
        height: 16,
        rotate: 0,
        vFlip: false,
        hFlip: false,
    });
    /**
     * Create new icon with all properties
     */
    function fullIcon(icon) {
        return merge_1.merge(exports.iconDefaults, icon);
    }
    exports.fullIcon = fullIcon;
    });

    var merge = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.mergeIcons = void 0;

    /**
     * Icon keys
     */
    const iconKeys = Object.keys(icon.iconDefaults);
    /**
     * Merge two icons
     *
     * icon2 overrides icon1
     */
    function mergeIcons(icon1, icon2) {
        const icon = Object.create(null);
        iconKeys.forEach((key) => {
            if (icon1[key] === void 0) {
                if (icon2[key] !== void 0) {
                    icon[key] = icon2[key];
                }
                return;
            }
            if (icon2[key] === void 0) {
                icon[key] = icon1[key];
                return;
            }
            switch (key) {
                case 'rotate':
                    icon[key] =
                        (icon1[key] + icon2[key]) % 4;
                    return;
                case 'hFlip':
                case 'vFlip':
                    icon[key] = icon1[key] !== icon2[key];
                    return;
                default:
                    icon[key] = icon2[key];
            }
        });
        return icon;
    }
    exports.mergeIcons = mergeIcons;
    });

    var iconSet = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseIconSet = void 0;



    /**
     * Get list of defaults keys
     */
    const defaultsKeys = Object.keys(icon.iconDefaults);
    /**
     * Resolve alias
     */
    function resolveAlias(alias, icons, aliases, level = 0) {
        const parent = alias.parent;
        if (icons[parent] !== void 0) {
            return merge.mergeIcons(icons[parent], alias);
        }
        if (aliases[parent] !== void 0) {
            if (level > 2) {
                // icon + alias + alias + alias = too much nesting, possibly infinite
                return null;
            }
            const icon = resolveAlias(aliases[parent], icons, aliases, level + 1);
            if (icon) {
                return merge.mergeIcons(icon, alias);
            }
        }
        return null;
    }
    /**
     * Extract icons from an icon set
     */
    function parseIconSet(data, callback, list = 'none') {
        const added = [];
        // Must be an object
        if (typeof data !== 'object') {
            return list === 'none' ? false : added;
        }
        // Check for missing icons list returned by API
        if (data.not_found instanceof Array) {
            data.not_found.forEach((name) => {
                callback(name, null);
                if (list === 'all') {
                    added.push(name);
                }
            });
        }
        // Must have 'icons' object
        if (typeof data.icons !== 'object') {
            return list === 'none' ? false : added;
        }
        // Get default values
        const defaults = Object.create(null);
        defaultsKeys.forEach((key) => {
            if (data[key] !== void 0 && typeof data[key] !== 'object') {
                defaults[key] = data[key];
            }
        });
        // Get icons
        const icons = data.icons;
        Object.keys(icons).forEach((name) => {
            const icon$1 = icons[name];
            if (typeof icon$1.body !== 'string') {
                return;
            }
            // Freeze icon to make sure it will not be modified
            callback(name, Object.freeze(merge_1.merge(icon.iconDefaults, defaults, icon$1)));
            added.push(name);
        });
        // Get aliases
        if (typeof data.aliases === 'object') {
            const aliases = data.aliases;
            Object.keys(aliases).forEach((name) => {
                const icon$1 = resolveAlias(aliases[name], icons, aliases, 1);
                if (icon$1) {
                    // Freeze icon to make sure it will not be modified
                    callback(name, Object.freeze(merge_1.merge(icon.iconDefaults, defaults, icon$1)));
                    added.push(name);
                }
            });
        }
        return list === 'none' ? added.length > 0 : added;
    }
    exports.parseIconSet = parseIconSet;
    });

    var storage_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.listIcons = exports.getIcon = exports.iconExists = exports.addIcon = exports.addIconSet = exports.getStorage = exports.newStorage = void 0;


    /**
     * Storage by provider and prefix
     */
    const storage = Object.create(null);
    /**
     * Create new storage
     */
    function newStorage(provider, prefix) {
        return {
            provider,
            prefix,
            icons: Object.create(null),
            missing: Object.create(null),
        };
    }
    exports.newStorage = newStorage;
    /**
     * Get storage for provider and prefix
     */
    function getStorage(provider, prefix) {
        if (storage[provider] === void 0) {
            storage[provider] = Object.create(null);
        }
        const providerStorage = storage[provider];
        if (providerStorage[prefix] === void 0) {
            providerStorage[prefix] = newStorage(provider, prefix);
        }
        return providerStorage[prefix];
    }
    exports.getStorage = getStorage;
    /**
     * Add icon set to storage
     *
     * Returns array of added icons if 'list' is true and icons were added successfully
     */
    function addIconSet(storage, data, list = 'none') {
        const t = Date.now();
        return iconSet.parseIconSet(data, (name, icon) => {
            if (icon === null) {
                storage.missing[name] = t;
            }
            else {
                storage.icons[name] = icon;
            }
        }, list);
    }
    exports.addIconSet = addIconSet;
    /**
     * Add icon to storage
     */
    function addIcon(storage, name, icon$1) {
        try {
            if (typeof icon$1.body === 'string') {
                // Freeze icon to make sure it will not be modified
                storage.icons[name] = Object.freeze(icon.fullIcon(icon$1));
                return true;
            }
        }
        catch (err) {
            // Do nothing
        }
        return false;
    }
    exports.addIcon = addIcon;
    /**
     * Check if icon exists
     */
    function iconExists(storage, name) {
        return storage.icons[name] !== void 0;
    }
    exports.iconExists = iconExists;
    /**
     * Get icon data
     */
    function getIcon(storage, name) {
        const value = storage.icons[name];
        return value === void 0 ? null : value;
    }
    exports.getIcon = getIcon;
    /**
     * List available icons
     */
    function listIcons(provider, prefix) {
        let allIcons = [];
        // Get providers
        let providers;
        if (typeof provider === 'string') {
            providers = [provider];
        }
        else {
            providers = Object.keys(storage);
        }
        // Get all icons
        providers.forEach((provider) => {
            let prefixes;
            if (typeof provider === 'string' && typeof prefix === 'string') {
                prefixes = [prefix];
            }
            else {
                prefixes =
                    storage[provider] === void 0
                        ? []
                        : Object.keys(storage[provider]);
            }
            prefixes.forEach((prefix) => {
                const storage = getStorage(provider, prefix);
                const icons = Object.keys(storage.icons).map((name) => (provider !== '' ? '@' + provider + ':' : '') +
                    prefix +
                    ':' +
                    name);
                allIcons = allIcons.concat(icons);
            });
        });
        return allIcons;
    }
    exports.listIcons = listIcons;
    });

    var functions = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.storageFunctions = exports.addCollection = exports.addIcon = exports.getIconData = exports.allowSimpleNames = void 0;




    /**
     * Allow storing icons without provider or prefix, making it possible to store icons like "home"
     */
    let simpleNames = false;
    function allowSimpleNames(allow) {
        if (typeof allow === 'boolean') {
            simpleNames = allow;
        }
        return simpleNames;
    }
    exports.allowSimpleNames = allowSimpleNames;
    /**
     * Get icon data
     */
    function getIconData(name$1) {
        const icon = typeof name$1 === 'string' ? name.stringToIcon(name$1, true, simpleNames) : name$1;
        return icon
            ? storage_1.getIcon(storage_1.getStorage(icon.provider, icon.prefix), icon.name)
            : null;
    }
    exports.getIconData = getIconData;
    /**
     * Add one icon
     */
    function addIcon(name$1, data) {
        const icon = name.stringToIcon(name$1, true, simpleNames);
        if (!icon) {
            return false;
        }
        const storage = storage_1.getStorage(icon.provider, icon.prefix);
        return storage_1.addIcon(storage, icon.name, data);
    }
    exports.addIcon = addIcon;
    /**
     * Add icon set
     */
    function addCollection(data, provider) {
        if (typeof data !== 'object') {
            return false;
        }
        // Get provider
        if (typeof provider !== 'string') {
            provider = typeof data.provider === 'string' ? data.provider : '';
        }
        // Check for simple names: requires empty provider and prefix
        if (simpleNames &&
            provider === '' &&
            (typeof data.prefix !== 'string' || data.prefix === '')) {
            // Simple names: add icons one by one
            let added = false;
            iconSet.parseIconSet(data, (name, icon) => {
                if (icon !== null && addIcon(name, icon)) {
                    added = true;
                }
            });
            return added;
        }
        // Validate provider and prefix
        if (typeof data.prefix !== 'string' ||
            !name.validateIcon({
                provider,
                prefix: data.prefix,
                name: 'a',
            })) {
            return false;
        }
        const storage = storage_1.getStorage(provider, data.prefix);
        return !!storage_1.addIconSet(storage, data);
    }
    exports.addCollection = addCollection;
    /**
     * Export
     */
    exports.storageFunctions = {
        // Check if icon exists
        iconExists: (name) => getIconData(name) !== null,
        // Get raw icon data
        getIcon: (name) => {
            const result = getIconData(name);
            return result ? merge_1.merge(result) : null;
        },
        // List icons
        listIcons: storage_1.listIcons,
        // Add icon
        addIcon,
        // Add icon set
        addCollection,
    };
    });

    var ids = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.replaceIDs = void 0;
    /**
     * Regular expression for finding ids
     */
    const regex = /\sid="(\S+)"/g;
    /**
     * New random-ish prefix for ids
     */
    const randomPrefix = 'IconifyId-' +
        Date.now().toString(16) +
        '-' +
        ((Math.random() * 0x1000000) | 0).toString(16) +
        '-';
    /**
     * Counter for ids, increasing with every replacement
     */
    let counter = 0;
    /**
     * Replace multiple occurance of same string
     */
    function strReplace(search, replace, subject) {
        let pos = 0;
        while ((pos = subject.indexOf(search, pos)) !== -1) {
            subject =
                subject.slice(0, pos) +
                    replace +
                    subject.slice(pos + search.length);
            pos += replace.length;
        }
        return subject;
    }
    /**
     * Replace IDs in SVG output with unique IDs
     * Fast replacement without parsing XML, assuming commonly used patterns and clean XML (icon should have been cleaned up with Iconify Tools or SVGO).
     */
    function replaceIDs(body, prefix = randomPrefix) {
        // Find all IDs
        const ids = [];
        let match;
        while ((match = regex.exec(body))) {
            ids.push(match[1]);
        }
        if (!ids.length) {
            return body;
        }
        // Replace with unique ids
        ids.forEach(id => {
            const newID = typeof prefix === 'function' ? prefix() : prefix + counter++;
            body = strReplace('="' + id + '"', '="' + newID + '"', body);
            body = strReplace('="#' + id + '"', '="#' + newID + '"', body);
            body = strReplace('(#' + id + ')', '(#' + newID + ')', body);
        });
        return body;
    }
    exports.replaceIDs = replaceIDs;
    });

    var calcSize = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.calculateSize = void 0;
    /**
     * Regular expressions for calculating dimensions
     */
    const unitsSplit = /(-?[0-9.]*[0-9]+[0-9.]*)/g;
    const unitsTest = /^-?[0-9.]*[0-9]+[0-9.]*$/g;
    /**
     * Calculate second dimension when only 1 dimension is set
     *
     * @param {string|number} size One dimension (such as width)
     * @param {number} ratio Width/height ratio.
     *      If size is width, ratio = height/width
     *      If size is height, ratio = width/height
     * @param {number} [precision] Floating number precision in result to minimize output. Default = 2
     * @return {string|number} Another dimension
     */
    function calculateSize(size, ratio, precision) {
        if (ratio === 1) {
            return size;
        }
        precision = precision === void 0 ? 100 : precision;
        if (typeof size === 'number') {
            return Math.ceil(size * ratio * precision) / precision;
        }
        if (typeof size !== 'string') {
            return size;
        }
        // Split code into sets of strings and numbers
        const oldParts = size.split(unitsSplit);
        if (oldParts === null || !oldParts.length) {
            return size;
        }
        const newParts = [];
        let code = oldParts.shift();
        let isNumber = unitsTest.test(code);
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (isNumber) {
                const num = parseFloat(code);
                if (isNaN(num)) {
                    newParts.push(code);
                }
                else {
                    newParts.push(Math.ceil(num * ratio * precision) / precision);
                }
            }
            else {
                newParts.push(code);
            }
            // next
            code = oldParts.shift();
            if (code === void 0) {
                return newParts.join('');
            }
            isNumber = !isNumber;
        }
    }
    exports.calculateSize = calculateSize;
    });

    var customisations = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.mergeCustomisations = exports.defaults = void 0;
    /**
     * Default icon customisations values
     */
    exports.defaults = Object.freeze({
        // Display mode
        inline: false,
        // Dimensions
        width: null,
        height: null,
        // Alignment
        hAlign: 'center',
        vAlign: 'middle',
        slice: false,
        // Transformations
        hFlip: false,
        vFlip: false,
        rotate: 0,
    });
    /**
     * Convert IconifyIconCustomisations to FullIconCustomisations
     */
    function mergeCustomisations(defaults, item) {
        const result = {};
        for (const key in defaults) {
            const attr = key;
            // Copy old value
            result[attr] = defaults[attr];
            if (item[attr] === void 0) {
                continue;
            }
            // Validate new value
            const value = item[attr];
            switch (attr) {
                // Boolean attributes that override old value
                case 'inline':
                case 'slice':
                    if (typeof value === 'boolean') {
                        result[attr] = value;
                    }
                    break;
                // Boolean attributes that are merged
                case 'hFlip':
                case 'vFlip':
                    if (value === true) {
                        result[attr] = !result[attr];
                    }
                    break;
                // Non-empty string
                case 'hAlign':
                case 'vAlign':
                    if (typeof value === 'string' && value !== '') {
                        result[attr] = value;
                    }
                    break;
                // Non-empty string / non-zero number / null
                case 'width':
                case 'height':
                    if ((typeof value === 'string' && value !== '') ||
                        (typeof value === 'number' && value) ||
                        value === null) {
                        result[attr] = value;
                    }
                    break;
                // Rotation
                case 'rotate':
                    if (typeof value === 'number') {
                        result[attr] += value;
                    }
                    break;
            }
        }
        return result;
    }
    exports.mergeCustomisations = mergeCustomisations;
    });

    var builder = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.iconToSVG = void 0;

    /**
     * Get preserveAspectRatio value
     */
    function preserveAspectRatio(props) {
        let result = '';
        switch (props.hAlign) {
            case 'left':
                result += 'xMin';
                break;
            case 'right':
                result += 'xMax';
                break;
            default:
                result += 'xMid';
        }
        switch (props.vAlign) {
            case 'top':
                result += 'YMin';
                break;
            case 'bottom':
                result += 'YMax';
                break;
            default:
                result += 'YMid';
        }
        result += props.slice ? ' slice' : ' meet';
        return result;
    }
    /**
     * Get SVG attributes and content from icon + customisations
     *
     * Does not generate style to make it compatible with frameworks that use objects for style, such as React.
     * Instead, it generates 'inline' value. If true, rendering engine should add verticalAlign: -0.125em to icon.
     *
     * Customisations should be normalised by platform specific parser.
     * Result should be converted to <svg> by platform specific parser.
     * Use replaceIDs to generate unique IDs for body.
     */
    function iconToSVG(icon, customisations) {
        // viewBox
        const box = {
            left: icon.left,
            top: icon.top,
            width: icon.width,
            height: icon.height,
        };
        // Body
        let body = icon.body;
        // Apply transformations
        [icon, customisations].forEach((props) => {
            const transformations = [];
            const hFlip = props.hFlip;
            const vFlip = props.vFlip;
            let rotation = props.rotate;
            // Icon is flipped first, then rotated
            if (hFlip) {
                if (vFlip) {
                    rotation += 2;
                }
                else {
                    // Horizontal flip
                    transformations.push('translate(' +
                        (box.width + box.left) +
                        ' ' +
                        (0 - box.top) +
                        ')');
                    transformations.push('scale(-1 1)');
                    box.top = box.left = 0;
                }
            }
            else if (vFlip) {
                // Vertical flip
                transformations.push('translate(' +
                    (0 - box.left) +
                    ' ' +
                    (box.height + box.top) +
                    ')');
                transformations.push('scale(1 -1)');
                box.top = box.left = 0;
            }
            let tempValue;
            if (rotation < 0) {
                rotation -= Math.floor(rotation / 4) * 4;
            }
            rotation = rotation % 4;
            switch (rotation) {
                case 1:
                    // 90deg
                    tempValue = box.height / 2 + box.top;
                    transformations.unshift('rotate(90 ' + tempValue + ' ' + tempValue + ')');
                    break;
                case 2:
                    // 180deg
                    transformations.unshift('rotate(180 ' +
                        (box.width / 2 + box.left) +
                        ' ' +
                        (box.height / 2 + box.top) +
                        ')');
                    break;
                case 3:
                    // 270deg
                    tempValue = box.width / 2 + box.left;
                    transformations.unshift('rotate(-90 ' + tempValue + ' ' + tempValue + ')');
                    break;
            }
            if (rotation % 2 === 1) {
                // Swap width/height and x/y for 90deg or 270deg rotation
                if (box.left !== 0 || box.top !== 0) {
                    tempValue = box.left;
                    box.left = box.top;
                    box.top = tempValue;
                }
                if (box.width !== box.height) {
                    tempValue = box.width;
                    box.width = box.height;
                    box.height = tempValue;
                }
            }
            if (transformations.length) {
                body =
                    '<g transform="' +
                        transformations.join(' ') +
                        '">' +
                        body +
                        '</g>';
            }
        });
        // Calculate dimensions
        let width, height;
        if (customisations.width === null && customisations.height === null) {
            // Set height to '1em', calculate width
            height = '1em';
            width = calcSize.calculateSize(height, box.width / box.height);
        }
        else if (customisations.width !== null &&
            customisations.height !== null) {
            // Values are set
            width = customisations.width;
            height = customisations.height;
        }
        else if (customisations.height !== null) {
            // Height is set
            height = customisations.height;
            width = calcSize.calculateSize(height, box.width / box.height);
        }
        else {
            // Width is set
            width = customisations.width;
            height = calcSize.calculateSize(width, box.height / box.width);
        }
        // Check for 'auto'
        if (width === 'auto') {
            width = box.width;
        }
        if (height === 'auto') {
            height = box.height;
        }
        // Convert to string
        width = typeof width === 'string' ? width : width + '';
        height = typeof height === 'string' ? height : height + '';
        // Result
        const result = {
            attributes: {
                width,
                height,
                preserveAspectRatio: preserveAspectRatio(customisations),
                viewBox: box.left + ' ' + box.top + ' ' + box.width + ' ' + box.height,
            },
            body,
        };
        if (customisations.inline) {
            result.inline = true;
        }
        return result;
    }
    exports.iconToSVG = iconToSVG;
    });

    var functions$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.builderFunctions = void 0;





    /**
     * Exported builder functions
     */
    exports.builderFunctions = {
        replaceIDs: ids.replaceIDs,
        calculateSize: calcSize.calculateSize,
        buildIcon: (icon$1, customisations$1) => {
            return builder.iconToSVG(icon.fullIcon(icon$1), customisations.mergeCustomisations(customisations.defaults, customisations$1));
        },
    };
    });

    var modules = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.coreModules = void 0;
    exports.coreModules = {};
    });

    var config = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.defaultConfig = void 0;
    /**
     * Default RedundancyConfig for API calls
     */
    exports.defaultConfig = {
        resources: [],
        index: 0,
        timeout: 2000,
        rotate: 750,
        random: false,
        dataAfterTimeout: false,
    };
    });

    var query = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sendQuery = void 0;
    /**
     * Send query
     */
    function sendQuery(config, payload, query, done, success) {
        // Get number of resources
        const resourcesCount = config.resources.length;
        // Save start index
        const startIndex = config.random
            ? Math.floor(Math.random() * resourcesCount)
            : config.index;
        // Get resources
        let resources;
        if (config.random) {
            // Randomise array
            let list = config.resources.slice(0);
            resources = [];
            while (list.length > 1) {
                const nextIndex = Math.floor(Math.random() * list.length);
                resources.push(list[nextIndex]);
                list = list.slice(0, nextIndex).concat(list.slice(nextIndex + 1));
            }
            resources = resources.concat(list);
        }
        else {
            // Rearrange resources to start with startIndex
            resources = config.resources
                .slice(startIndex)
                .concat(config.resources.slice(0, startIndex));
        }
        // Counters, status
        const startTime = Date.now();
        let status = 'pending';
        let queriesSent = 0;
        let lastError = void 0;
        // Timer
        let timer = null;
        // Execution queue
        let queue = [];
        // Callbacks to call when query is complete
        let doneCallbacks = [];
        if (typeof done === 'function') {
            doneCallbacks.push(done);
        }
        /**
         * Reset timer
         */
        function resetTimer() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }
        /**
         * Abort everything
         */
        function abort() {
            // Change status
            if (status === 'pending') {
                status = 'aborted';
            }
            // Reset timer
            resetTimer();
            // Abort all queued items
            queue.forEach((item) => {
                if (item.abort) {
                    item.abort();
                }
                if (item.status === 'pending') {
                    item.status = 'aborted';
                }
            });
            queue = [];
        }
        /**
         * Add / replace callback to call when execution is complete.
         * This can be used to abort pending query implementations when query is complete or aborted.
         */
        function subscribe(callback, overwrite) {
            if (overwrite) {
                doneCallbacks = [];
            }
            if (typeof callback === 'function') {
                doneCallbacks.push(callback);
            }
        }
        /**
         * Get query status
         */
        function getQueryStatus() {
            return {
                startTime,
                payload,
                status,
                queriesSent,
                queriesPending: queue.length,
                subscribe,
                abort,
            };
        }
        /**
         * Fail query
         */
        function failQuery() {
            status = 'failed';
            // Send notice to all callbacks
            doneCallbacks.forEach((callback) => {
                callback(void 0, lastError);
            });
        }
        /**
         * Clear queue
         */
        function clearQueue() {
            queue = queue.filter((item) => {
                if (item.status === 'pending') {
                    item.status = 'aborted';
                }
                if (item.abort) {
                    item.abort();
                }
                return false;
            });
        }
        /**
         * Got response from module
         */
        function moduleResponse(item, data, error) {
            const isError = data === void 0;
            // Remove item from queue
            queue = queue.filter((queued) => queued !== item);
            // Check status
            switch (status) {
                case 'pending':
                    // Pending
                    break;
                case 'failed':
                    if (isError || !config.dataAfterTimeout) {
                        // Query has already timed out or dataAfterTimeout is disabled
                        return;
                    }
                    // Success after failure
                    break;
                default:
                    // Aborted or completed
                    return;
            }
            // Error
            if (isError) {
                if (error !== void 0) {
                    lastError = error;
                }
                if (!queue.length) {
                    if (!resources.length) {
                        // Nothing else queued, nothing can be queued
                        failQuery();
                    }
                    else {
                        // Queue is empty: run next item immediately
                        // eslint-disable-next-line @typescript-eslint/no-use-before-define
                        execNext();
                    }
                }
                return;
            }
            // Reset timers, abort pending queries
            resetTimer();
            clearQueue();
            // Update index in Redundancy
            if (success && !config.random) {
                const index = config.resources.indexOf(item.resource);
                if (index !== -1 && index !== config.index) {
                    success(index);
                }
            }
            // Mark as completed and call callbacks
            status = 'completed';
            doneCallbacks.forEach((callback) => {
                callback(data);
            });
        }
        /**
         * Execute next query
         */
        function execNext() {
            // Check status
            if (status !== 'pending') {
                return;
            }
            // Reset timer
            resetTimer();
            // Get resource
            const resource = resources.shift();
            if (resource === void 0) {
                // Nothing to execute: wait for final timeout before failing
                if (queue.length) {
                    const timeout = typeof config.timeout === 'function'
                        ? config.timeout(startTime)
                        : config.timeout;
                    if (timeout) {
                        // Last timeout before failing to allow late response
                        timer = setTimeout(() => {
                            resetTimer();
                            if (status === 'pending') {
                                // Clear queue
                                clearQueue();
                                failQuery();
                            }
                        }, timeout);
                        return;
                    }
                }
                // Fail
                failQuery();
                return;
            }
            // Create new item
            const item = {
                getQueryStatus,
                status: 'pending',
                resource,
                done: (data, error) => {
                    moduleResponse(item, data, error);
                },
            };
            // Add to queue
            queue.push(item);
            // Bump next index
            queriesSent++;
            // Get timeout for next item
            const timeout = typeof config.rotate === 'function'
                ? config.rotate(queriesSent, startTime)
                : config.rotate;
            // Create timer
            timer = setTimeout(execNext, timeout);
            // Execute it
            query(resource, payload, item);
        }
        // Execute first query on next tick
        setTimeout(execNext);
        // Return getQueryStatus()
        return getQueryStatus;
    }
    exports.sendQuery = sendQuery;
    });

    var redundancy = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.initRedundancy = void 0;


    /**
     * Set configuration
     */
    function setConfig(config$1) {
        if (typeof config$1 !== 'object' ||
            typeof config$1.resources !== 'object' ||
            !(config$1.resources instanceof Array) ||
            !config$1.resources.length) {
            throw new Error('Invalid Reduncancy configuration');
        }
        const newConfig = Object.create(null);
        let key;
        for (key in config.defaultConfig) {
            if (config$1[key] !== void 0) {
                newConfig[key] = config$1[key];
            }
            else {
                newConfig[key] = config.defaultConfig[key];
            }
        }
        return newConfig;
    }
    /**
     * Redundancy instance
     */
    function initRedundancy(cfg) {
        // Configuration
        const config = setConfig(cfg);
        // List of queries
        let queries = [];
        /**
         * Remove aborted and completed queries
         */
        function cleanup() {
            queries = queries.filter((item) => item().status === 'pending');
        }
        /**
         * Send query
         */
        function query$1(payload, queryCallback, doneCallback) {
            const query$1 = query.sendQuery(config, payload, queryCallback, (data, error) => {
                // Remove query from list
                cleanup();
                // Call callback
                if (doneCallback) {
                    doneCallback(data, error);
                }
            }, (newIndex) => {
                // Update start index
                config.index = newIndex;
            });
            queries.push(query$1);
            return query$1;
        }
        /**
         * Find instance
         */
        function find(callback) {
            const result = queries.find((value) => {
                return callback(value);
            });
            return result !== void 0 ? result : null;
        }
        // Create and return functions
        const instance = {
            query: query$1,
            find,
            setIndex: (index) => {
                config.index = index;
            },
            getIndex: () => config.index,
            cleanup,
        };
        return instance;
    }
    exports.initRedundancy = initRedundancy;
    });

    var sort = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sortIcons = void 0;

    /**
     * Check if icons have been loaded
     */
    function sortIcons(icons) {
        const result = {
            loaded: [],
            missing: [],
            pending: [],
        };
        const storage = Object.create(null);
        // Sort icons alphabetically to prevent duplicates and make sure they are sorted in API queries
        icons.sort((a, b) => {
            if (a.provider !== b.provider) {
                return a.provider.localeCompare(b.provider);
            }
            if (a.prefix !== b.prefix) {
                return a.prefix.localeCompare(b.prefix);
            }
            return a.name.localeCompare(b.name);
        });
        let lastIcon = {
            provider: '',
            prefix: '',
            name: '',
        };
        icons.forEach((icon) => {
            if (lastIcon.name === icon.name &&
                lastIcon.prefix === icon.prefix &&
                lastIcon.provider === icon.provider) {
                return;
            }
            lastIcon = icon;
            // Check icon
            const provider = icon.provider;
            const prefix = icon.prefix;
            const name = icon.name;
            if (storage[provider] === void 0) {
                storage[provider] = Object.create(null);
            }
            const providerStorage = storage[provider];
            if (providerStorage[prefix] === void 0) {
                providerStorage[prefix] = storage_1.getStorage(provider, prefix);
            }
            const localStorage = providerStorage[prefix];
            let list;
            if (localStorage.icons[name] !== void 0) {
                list = result.loaded;
            }
            else if (prefix === '' || localStorage.missing[name] !== void 0) {
                // Mark icons without prefix as missing because they cannot be loaded from API
                list = result.missing;
            }
            else {
                list = result.pending;
            }
            const item = {
                provider,
                prefix,
                name,
            };
            list.push(item);
        });
        return result;
    }
    exports.sortIcons = sortIcons;
    });

    var callbacks = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.storeCallback = exports.updateCallbacks = exports.callbacks = void 0;

    // Records sorted by provider and prefix
    // This export is only for unit testing, should not be used
    exports.callbacks = Object.create(null);
    const pendingUpdates = Object.create(null);
    /**
     * Remove callback
     */
    function removeCallback(sources, id) {
        sources.forEach((source) => {
            const provider = source.provider;
            if (exports.callbacks[provider] === void 0) {
                return;
            }
            const providerCallbacks = exports.callbacks[provider];
            const prefix = source.prefix;
            const items = providerCallbacks[prefix];
            if (items) {
                providerCallbacks[prefix] = items.filter((row) => row.id !== id);
            }
        });
    }
    /**
     * Update all callbacks for provider and prefix
     */
    function updateCallbacks(provider, prefix) {
        if (pendingUpdates[provider] === void 0) {
            pendingUpdates[provider] = Object.create(null);
        }
        const providerPendingUpdates = pendingUpdates[provider];
        if (!providerPendingUpdates[prefix]) {
            providerPendingUpdates[prefix] = true;
            setTimeout(() => {
                providerPendingUpdates[prefix] = false;
                if (exports.callbacks[provider] === void 0 ||
                    exports.callbacks[provider][prefix] === void 0) {
                    return;
                }
                // Get all items
                const items = exports.callbacks[provider][prefix].slice(0);
                if (!items.length) {
                    return;
                }
                const storage = storage_1.getStorage(provider, prefix);
                // Check each item for changes
                let hasPending = false;
                items.forEach((item) => {
                    const icons = item.icons;
                    const oldLength = icons.pending.length;
                    icons.pending = icons.pending.filter((icon) => {
                        if (icon.prefix !== prefix) {
                            // Checking only current prefix
                            return true;
                        }
                        const name = icon.name;
                        if (storage.icons[name] !== void 0) {
                            // Loaded
                            icons.loaded.push({
                                provider,
                                prefix,
                                name,
                            });
                        }
                        else if (storage.missing[name] !== void 0) {
                            // Missing
                            icons.missing.push({
                                provider,
                                prefix,
                                name,
                            });
                        }
                        else {
                            // Pending
                            hasPending = true;
                            return true;
                        }
                        return false;
                    });
                    // Changes detected - call callback
                    if (icons.pending.length !== oldLength) {
                        if (!hasPending) {
                            // All icons have been loaded - remove callback from prefix
                            removeCallback([
                                {
                                    provider,
                                    prefix,
                                },
                            ], item.id);
                        }
                        item.callback(icons.loaded.slice(0), icons.missing.slice(0), icons.pending.slice(0), item.abort);
                    }
                });
            });
        }
    }
    exports.updateCallbacks = updateCallbacks;
    /**
     * Unique id counter for callbacks
     */
    let idCounter = 0;
    /**
     * Add callback
     */
    function storeCallback(callback, icons, pendingSources) {
        // Create unique id and abort function
        const id = idCounter++;
        const abort = removeCallback.bind(null, pendingSources, id);
        if (!icons.pending.length) {
            // Do not store item without pending icons and return function that does nothing
            return abort;
        }
        // Create item and store it for all pending prefixes
        const item = {
            id,
            icons,
            callback,
            abort: abort,
        };
        pendingSources.forEach((source) => {
            const provider = source.provider;
            const prefix = source.prefix;
            if (exports.callbacks[provider] === void 0) {
                exports.callbacks[provider] = Object.create(null);
            }
            const providerCallbacks = exports.callbacks[provider];
            if (providerCallbacks[prefix] === void 0) {
                providerCallbacks[prefix] = [];
            }
            providerCallbacks[prefix].push(item);
        });
        return abort;
    }
    exports.storeCallback = storeCallback;
    });

    var modules$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAPIModule = exports.setAPIModule = void 0;
    /**
     * Local storate types and entries
     */
    const storage = Object.create(null);
    /**
     * Set API module
     */
    function setAPIModule(provider, item) {
        storage[provider] = item;
    }
    exports.setAPIModule = setAPIModule;
    /**
     * Get API module
     */
    function getAPIModule(provider) {
        return storage[provider] === void 0 ? storage[''] : storage[provider];
    }
    exports.getAPIModule = getAPIModule;
    });

    var config$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAPIConfig = exports.setAPIConfig = void 0;
    /**
     * Create full API configuration from partial data
     */
    function createConfig(source) {
        let resources;
        if (typeof source.resources === 'string') {
            resources = [source.resources];
        }
        else {
            resources = source.resources;
            if (!(resources instanceof Array) || !resources.length) {
                return null;
            }
        }
        const result = {
            // API hosts
            resources: resources,
            // Root path
            path: source.path === void 0 ? '/' : source.path,
            // URL length limit
            maxURL: source.maxURL ? source.maxURL : 500,
            // Timeout before next host is used.
            rotate: source.rotate ? source.rotate : 750,
            // Timeout before failing query.
            timeout: source.timeout ? source.timeout : 5000,
            // Randomise default API end point.
            random: source.random === true,
            // Start index
            index: source.index ? source.index : 0,
            // Receive data after time out (used if time out kicks in first, then API module sends data anyway).
            dataAfterTimeout: source.dataAfterTimeout !== false,
        };
        return result;
    }
    /**
     * Local storage
     */
    const configStorage = Object.create(null);
    /**
     * Redundancy for API servers.
     *
     * API should have very high uptime because of implemented redundancy at server level, but
     * sometimes bad things happen. On internet 100% uptime is not possible.
     *
     * There could be routing problems. Server might go down for whatever reason, but it takes
     * few minutes to detect that downtime, so during those few minutes API might not be accessible.
     *
     * This script has some redundancy to mitigate possible network issues.
     *
     * If one host cannot be reached in 'rotate' (750 by default) ms, script will try to retrieve
     * data from different host. Hosts have different configurations, pointing to different
     * API servers hosted at different providers.
     */
    const fallBackAPISources = [
        'https://api.simplesvg.com',
        'https://api.unisvg.com',
    ];
    // Shuffle fallback API
    const fallBackAPI = [];
    while (fallBackAPISources.length > 0) {
        if (fallBackAPISources.length === 1) {
            fallBackAPI.push(fallBackAPISources.shift());
        }
        else {
            // Get first or last item
            if (Math.random() > 0.5) {
                fallBackAPI.push(fallBackAPISources.shift());
            }
            else {
                fallBackAPI.push(fallBackAPISources.pop());
            }
        }
    }
    // Add default API
    configStorage[''] = createConfig({
        resources: ['https://api.iconify.design'].concat(fallBackAPI),
    });
    /**
     * Add custom config for provider
     */
    function setAPIConfig(provider, customConfig) {
        const config = createConfig(customConfig);
        if (config === null) {
            return false;
        }
        configStorage[provider] = config;
        return true;
    }
    exports.setAPIConfig = setAPIConfig;
    /**
     * Get API configuration
     */
    const getAPIConfig = (provider) => configStorage[provider];
    exports.getAPIConfig = getAPIConfig;
    });

    var list = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getProviders = exports.listToIcons = void 0;

    /**
     * Convert icons list from string/icon mix to icons and validate them
     */
    function listToIcons(list, validate = true, simpleNames = false) {
        const result = [];
        list.forEach((item) => {
            const icon = typeof item === 'string'
                ? name.stringToIcon(item, false, simpleNames)
                : item;
            if (!validate || name.validateIcon(icon, simpleNames)) {
                result.push({
                    provider: icon.provider,
                    prefix: icon.prefix,
                    name: icon.name,
                });
            }
        });
        return result;
    }
    exports.listToIcons = listToIcons;
    /**
     * Get all providers
     */
    function getProviders(list) {
        const providers = Object.create(null);
        list.forEach((icon) => {
            providers[icon.provider] = true;
        });
        return Object.keys(providers);
    }
    exports.getProviders = getProviders;
    });

    var api = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.API = exports.getRedundancyCache = void 0;









    // Empty abort callback for loadIcons()
    function emptyCallback() {
        // Do nothing
    }
    const pendingIcons = Object.create(null);
    /**
     * List of icons that are waiting to be loaded.
     *
     * List is passed to API module, then cleared.
     *
     * This list should not be used for any checks, use pendingIcons to check
     * if icons is being loaded.
     *
     * [provider][prefix] = array of icon names
     */
    const iconsToLoad = Object.create(null);
    // Flags to merge multiple synchronous icon requests in one asynchronous request
    const loaderFlags = Object.create(null);
    const queueFlags = Object.create(null);
    const redundancyCache = Object.create(null);
    /**
     * Get Redundancy instance for provider
     */
    function getRedundancyCache(provider) {
        if (redundancyCache[provider] === void 0) {
            const config = config$1.getAPIConfig(provider);
            if (!config) {
                // No way to load icons because configuration is not set!
                return;
            }
            const redundancy$1 = redundancy.initRedundancy(config);
            const cachedReundancy = {
                config,
                redundancy: redundancy$1,
            };
            redundancyCache[provider] = cachedReundancy;
        }
        return redundancyCache[provider];
    }
    exports.getRedundancyCache = getRedundancyCache;
    /**
     * Function called when new icons have been loaded
     */
    function loadedNewIcons(provider, prefix) {
        // Run only once per tick, possibly joining multiple API responses in one call
        if (loaderFlags[provider] === void 0) {
            loaderFlags[provider] = Object.create(null);
        }
        const providerLoaderFlags = loaderFlags[provider];
        if (!providerLoaderFlags[prefix]) {
            providerLoaderFlags[prefix] = true;
            setTimeout(() => {
                providerLoaderFlags[prefix] = false;
                callbacks.updateCallbacks(provider, prefix);
            });
        }
    }
    // Storage for errors for loadNewIcons(). Used to avoid spamming log with identical errors.
    const errorsCache = Object.create(null);
    /**
     * Load icons
     */
    function loadNewIcons(provider, prefix, icons) {
        function err() {
            const key = (provider === '' ? '' : '@' + provider + ':') + prefix;
            const time = Math.floor(Date.now() / 60000); // log once in a minute
            if (errorsCache[key] < time) {
                errorsCache[key] = time;
                console.error('Unable to retrieve icons for "' +
                    key +
                    '" because API is not configured properly.');
            }
        }
        // Create nested objects if needed
        if (iconsToLoad[provider] === void 0) {
            iconsToLoad[provider] = Object.create(null);
        }
        const providerIconsToLoad = iconsToLoad[provider];
        if (queueFlags[provider] === void 0) {
            queueFlags[provider] = Object.create(null);
        }
        const providerQueueFlags = queueFlags[provider];
        if (pendingIcons[provider] === void 0) {
            pendingIcons[provider] = Object.create(null);
        }
        const providerPendingIcons = pendingIcons[provider];
        // Add icons to queue
        if (providerIconsToLoad[prefix] === void 0) {
            providerIconsToLoad[prefix] = icons;
        }
        else {
            providerIconsToLoad[prefix] = providerIconsToLoad[prefix]
                .concat(icons)
                .sort();
        }
        // Redundancy item
        let cachedReundancy;
        // Trigger update on next tick, mering multiple synchronous requests into one asynchronous request
        if (!providerQueueFlags[prefix]) {
            providerQueueFlags[prefix] = true;
            setTimeout(() => {
                providerQueueFlags[prefix] = false;
                // Get icons and delete queue
                const icons = providerIconsToLoad[prefix];
                delete providerIconsToLoad[prefix];
                // Get API module
                const api = modules$1.getAPIModule(provider);
                if (!api) {
                    // No way to load icons!
                    err();
                    return;
                }
                // Get API config and Redundancy instance
                if (cachedReundancy === void 0) {
                    const redundancy = getRedundancyCache(provider);
                    if (redundancy === void 0) {
                        // No way to load icons because configuration is not set!
                        err();
                        return;
                    }
                    cachedReundancy = redundancy;
                }
                // Prepare parameters and run queries
                const params = api.prepare(provider, prefix, icons);
                params.forEach((item) => {
                    cachedReundancy.redundancy.query(item, api.send, (data, error) => {
                        const storage = storage_1.getStorage(provider, prefix);
                        // Check for error
                        if (typeof data !== 'object') {
                            if (error !== 404) {
                                // Do not handle error unless it is 404
                                return;
                            }
                            // Not found: mark as missing
                            const t = Date.now();
                            item.icons.forEach((name) => {
                                storage.missing[name] = t;
                            });
                        }
                        else {
                            // Add icons to storage
                            try {
                                const added = storage_1.addIconSet(storage, data, 'all');
                                if (typeof added === 'boolean') {
                                    return;
                                }
                                // Remove added icons from pending list
                                const pending = providerPendingIcons[prefix];
                                added.forEach((name) => {
                                    delete pending[name];
                                });
                                // Cache API response
                                if (modules.coreModules.cache) {
                                    modules.coreModules.cache(provider, data);
                                }
                            }
                            catch (err) {
                                console.error(err);
                            }
                        }
                        // Trigger update on next tick
                        loadedNewIcons(provider, prefix);
                    });
                });
            });
        }
    }
    /**
     * Check if icon is being loaded
     */
    const isPending = (icon) => {
        return (pendingIcons[icon.provider] !== void 0 &&
            pendingIcons[icon.provider][icon.prefix] !== void 0 &&
            pendingIcons[icon.provider][icon.prefix][icon.name] !== void 0);
    };
    /**
     * Load icons
     */
    const loadIcons = (icons, callback) => {
        // Clean up and copy icons list
        const cleanedIcons = list.listToIcons(icons, true, functions.allowSimpleNames());
        // Sort icons by missing/loaded/pending
        // Pending means icon is either being requsted or is about to be requested
        const sortedIcons = sort.sortIcons(cleanedIcons);
        if (!sortedIcons.pending.length) {
            // Nothing to load
            let callCallback = true;
            if (callback) {
                setTimeout(() => {
                    if (callCallback) {
                        callback(sortedIcons.loaded, sortedIcons.missing, sortedIcons.pending, emptyCallback);
                    }
                });
            }
            return () => {
                callCallback = false;
            };
        }
        // Get all sources for pending icons
        const newIcons = Object.create(null);
        const sources = [];
        let lastProvider, lastPrefix;
        sortedIcons.pending.forEach((icon) => {
            const provider = icon.provider;
            const prefix = icon.prefix;
            if (prefix === lastPrefix && provider === lastProvider) {
                return;
            }
            lastProvider = provider;
            lastPrefix = prefix;
            sources.push({
                provider,
                prefix,
            });
            if (pendingIcons[provider] === void 0) {
                pendingIcons[provider] = Object.create(null);
            }
            const providerPendingIcons = pendingIcons[provider];
            if (providerPendingIcons[prefix] === void 0) {
                providerPendingIcons[prefix] = Object.create(null);
            }
            if (newIcons[provider] === void 0) {
                newIcons[provider] = Object.create(null);
            }
            const providerNewIcons = newIcons[provider];
            if (providerNewIcons[prefix] === void 0) {
                providerNewIcons[prefix] = [];
            }
        });
        // List of new icons
        const time = Date.now();
        // Filter pending icons list: find icons that are not being loaded yet
        // If icon was called before, it must exist in pendingIcons or storage, but because this
        // function is called right after sortIcons() that checks storage, icon is definitely not in storage.
        sortedIcons.pending.forEach((icon) => {
            const provider = icon.provider;
            const prefix = icon.prefix;
            const name = icon.name;
            const pendingQueue = pendingIcons[provider][prefix];
            if (pendingQueue[name] === void 0) {
                // New icon - add to pending queue to mark it as being loaded
                pendingQueue[name] = time;
                // Add it to new icons list to pass it to API module for loading
                newIcons[provider][prefix].push(name);
            }
        });
        // Load icons on next tick to make sure result is not returned before callback is stored and
        // to consolidate multiple synchronous loadIcons() calls into one asynchronous API call
        sources.forEach((source) => {
            const provider = source.provider;
            const prefix = source.prefix;
            if (newIcons[provider][prefix].length) {
                loadNewIcons(provider, prefix, newIcons[provider][prefix]);
            }
        });
        // Store callback and return abort function
        return callback
            ? callbacks.storeCallback(callback, sortedIcons, sources)
            : emptyCallback;
    };
    /**
     * Export module
     */
    exports.API = {
        isPending,
        loadIcons,
    };
    });

    var functions$2 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.APIInternalFunctions = exports.APIFunctions = void 0;



    exports.APIFunctions = {
        loadIcons: api.API.loadIcons,
        addAPIProvider: config$1.setAPIConfig,
    };
    exports.APIInternalFunctions = {
        getAPI: api.getRedundancyCache,
        getAPIConfig: config$1.getAPIConfig,
        setAPIModule: modules$1.setAPIModule,
    };
    });

    var jsonp = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAPIModule = void 0;
    let rootVar = null;
    /**
     * Endpoint
     */
    let endPoint = '{prefix}.js?icons={icons}&callback={callback}';
    /**
     * Cache: provider:prefix = value
     */
    const maxLengthCache = Object.create(null);
    const pathCache = Object.create(null);
    /**
     * Get hash for query
     *
     * Hash is used in JSONP callback name, so same queries end up with same JSONP callback,
     * allowing response to be cached in browser.
     */
    function hash(str) {
        let total = 0, i;
        for (i = str.length - 1; i >= 0; i--) {
            total += str.charCodeAt(i);
        }
        return total % 999;
    }
    /**
     * Get root object
     */
    function getGlobal() {
        // Create root
        if (rootVar === null) {
            // window
            const globalRoot = self;
            // Test for window.Iconify. If missing, create 'IconifyJSONP'
            let prefix = 'Iconify';
            let extraPrefix = '.cb';
            if (globalRoot[prefix] === void 0) {
                // Use 'IconifyJSONP' global
                prefix = 'IconifyJSONP';
                extraPrefix = '';
                if (globalRoot[prefix] === void 0) {
                    globalRoot[prefix] = Object.create(null);
                }
                rootVar = globalRoot[prefix];
            }
            else {
                // Use 'Iconify.cb'
                const iconifyRoot = globalRoot[prefix];
                if (iconifyRoot.cb === void 0) {
                    iconifyRoot.cb = Object.create(null);
                }
                rootVar = iconifyRoot.cb;
            }
            // Change end point
            endPoint = endPoint.replace('{callback}', prefix + extraPrefix + '.{cb}');
        }
        return rootVar;
    }
    /**
     * Return API module
     */
    const getAPIModule = (getAPIConfig) => {
        /**
         * Calculate maximum icons list length for prefix
         */
        function calculateMaxLength(provider, prefix) {
            // Get config and store path
            const config = getAPIConfig(provider);
            if (!config) {
                return 0;
            }
            // Calculate
            let result;
            if (!config.maxURL) {
                result = 0;
            }
            else {
                let maxHostLength = 0;
                config.resources.forEach((item) => {
                    const host = item;
                    maxHostLength = Math.max(maxHostLength, host.length);
                });
                // Make sure global is set
                getGlobal();
                // Extra width: prefix (3) + counter (4) - '{cb}' (4)
                const extraLength = 3;
                // Get available length
                result =
                    config.maxURL -
                        maxHostLength -
                        config.path.length -
                        endPoint
                            .replace('{provider}', provider)
                            .replace('{prefix}', prefix)
                            .replace('{icons}', '').length -
                        extraLength;
            }
            // Cache stuff and return result
            const cacheKey = provider + ':' + prefix;
            pathCache[cacheKey] = config.path;
            maxLengthCache[cacheKey] = result;
            return result;
        }
        /**
         * Prepare params
         */
        const prepare = (provider, prefix, icons) => {
            const results = [];
            // Get maximum icons list length
            const cacheKey = provider + ':' + prefix;
            let maxLength = maxLengthCache[cacheKey];
            if (maxLength === void 0) {
                maxLength = calculateMaxLength(provider, prefix);
            }
            // Split icons
            let item = {
                provider,
                prefix,
                icons: [],
            };
            let length = 0;
            icons.forEach((name, index) => {
                length += name.length + 1;
                if (length >= maxLength && index > 0) {
                    // Next set
                    results.push(item);
                    item = {
                        provider,
                        prefix,
                        icons: [],
                    };
                    length = name.length;
                }
                item.icons.push(name);
            });
            results.push(item);
            return results;
        };
        /**
         * Load icons
         */
        const send = (host, params, status) => {
            const provider = params.provider;
            const prefix = params.prefix;
            const icons = params.icons;
            const iconsList = icons.join(',');
            const cacheKey = provider + ':' + prefix;
            // Create callback prefix
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const cbPrefix = prefix.split('-').shift().slice(0, 3);
            const global = getGlobal();
            // Callback hash
            let cbCounter = hash(provider + ':' + host + ':' + prefix + ':' + iconsList);
            while (global[cbPrefix + cbCounter] !== void 0) {
                cbCounter++;
            }
            const callbackName = cbPrefix + cbCounter;
            const path = pathCache[cacheKey] +
                endPoint
                    .replace('{provider}', provider)
                    .replace('{prefix}', prefix)
                    .replace('{icons}', iconsList)
                    .replace('{cb}', callbackName);
            global[callbackName] = (data) => {
                // Remove callback and complete query
                delete global[callbackName];
                status.done(data);
            };
            // Create URI
            const uri = host + path;
            // console.log('API query:', uri);
            // Create script and append it to head
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.async = true;
            script.src = uri;
            document.head.appendChild(script);
        };
        // Return functions
        return {
            prepare,
            send,
        };
    };
    exports.getAPIModule = getAPIModule;
    });

    var fetch_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAPIModule = exports.setFetch = void 0;
    /**
     * Endpoint
     */
    const endPoint = '{prefix}.json?icons={icons}';
    /**
     * Cache
     */
    const maxLengthCache = Object.create(null);
    const pathCache = Object.create(null);
    /**
     * Fetch function
     *
     * Use this to set 'cross-fetch' in node.js environment if you are retrieving icons on server side.
     * Not needed when using stuff like Next.js or SvelteKit because components use API only on client side.
     */
    let fetchModule = null;
    try {
        fetchModule = fetch;
    }
    catch (err) {
        //
    }
    function setFetch(fetch) {
        fetchModule = fetch;
    }
    exports.setFetch = setFetch;
    /**
     * Return API module
     */
    const getAPIModule = (getAPIConfig) => {
        /**
         * Calculate maximum icons list length for prefix
         */
        function calculateMaxLength(provider, prefix) {
            // Get config and store path
            const config = getAPIConfig(provider);
            if (!config) {
                return 0;
            }
            // Calculate
            let result;
            if (!config.maxURL) {
                result = 0;
            }
            else {
                let maxHostLength = 0;
                config.resources.forEach((item) => {
                    const host = item;
                    maxHostLength = Math.max(maxHostLength, host.length);
                });
                // Get available length
                result =
                    config.maxURL -
                        maxHostLength -
                        config.path.length -
                        endPoint
                            .replace('{provider}', provider)
                            .replace('{prefix}', prefix)
                            .replace('{icons}', '').length;
            }
            // Cache stuff and return result
            const cacheKey = provider + ':' + prefix;
            pathCache[cacheKey] = config.path;
            maxLengthCache[cacheKey] = result;
            return result;
        }
        /**
         * Prepare params
         */
        const prepare = (provider, prefix, icons) => {
            const results = [];
            // Get maximum icons list length
            let maxLength = maxLengthCache[prefix];
            if (maxLength === void 0) {
                maxLength = calculateMaxLength(provider, prefix);
            }
            // Split icons
            let item = {
                provider,
                prefix,
                icons: [],
            };
            let length = 0;
            icons.forEach((name, index) => {
                length += name.length + 1;
                if (length >= maxLength && index > 0) {
                    // Next set
                    results.push(item);
                    item = {
                        provider,
                        prefix,
                        icons: [],
                    };
                    length = name.length;
                }
                item.icons.push(name);
            });
            results.push(item);
            return results;
        };
        /**
         * Load icons
         */
        const send = (host, params, status) => {
            const provider = params.provider;
            const prefix = params.prefix;
            const icons = params.icons;
            const iconsList = icons.join(',');
            const cacheKey = provider + ':' + prefix;
            const path = pathCache[cacheKey] +
                endPoint
                    .replace('{provider}', provider)
                    .replace('{prefix}', prefix)
                    .replace('{icons}', iconsList);
            if (!fetchModule) {
                // Fail: return 424 Failed Dependency (its not meant to be used like that, but it is the best match)
                status.done(void 0, 424);
                return;
            }
            // console.log('API query:', host + path);
            fetchModule(host + path)
                .then((response) => {
                if (response.status !== 200) {
                    status.done(void 0, response.status);
                    return;
                }
                return response.json();
            })
                .then((data) => {
                if (typeof data !== 'object' || data === null) {
                    return;
                }
                // Store cache and complete
                status.done(data);
            })
                .catch((err) => {
                // Error
                status.done(void 0, err.errno);
            });
        };
        // Return functions
        return {
            prepare,
            send,
        };
    };
    exports.getAPIModule = getAPIModule;
    });

    var browserStorage = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.storeCache = exports.loadCache = exports.mock = exports.emptyList = exports.count = exports.config = void 0;

    // After changing configuration change it in tests/*/fake_cache.ts
    // Cache version. Bump when structure changes
    const cacheVersion = 'iconify2';
    // Cache keys
    const cachePrefix = 'iconify';
    const countKey = cachePrefix + '-count';
    const versionKey = cachePrefix + '-version';
    /**
     * Cache expiration
     */
    const hour = 3600000;
    const cacheExpiration = 168; // In hours
    /**
     * Storage configuration
     */
    exports.config = {
        local: true,
        session: true,
    };
    /**
     * Flag to check if storage has been loaded
     */
    let loaded = false;
    /**
     * Items counter
     */
    exports.count = {
        local: 0,
        session: 0,
    };
    /**
     * List of empty items
     */
    exports.emptyList = {
        local: [],
        session: [],
    };
    let _window = typeof window === 'undefined' ? {} : window;
    function mock(fakeWindow) {
        loaded = false;
        _window = fakeWindow;
    }
    exports.mock = mock;
    /**
     * Get global
     *
     * @param key
     */
    function getGlobal(key) {
        const attr = key + 'Storage';
        try {
            if (_window &&
                _window[attr] &&
                typeof _window[attr].length === 'number') {
                return _window[attr];
            }
        }
        catch (err) {
            //
        }
        // Failed - mark as disabled
        exports.config[key] = false;
        return null;
    }
    /**
     * Change current count for storage
     */
    function setCount(storage, key, value) {
        try {
            storage.setItem(countKey, value + '');
            exports.count[key] = value;
            return true;
        }
        catch (err) {
            return false;
        }
    }
    /**
     * Get current count from storage
     *
     * @param storage
     */
    function getCount(storage) {
        const count = storage.getItem(countKey);
        if (count) {
            const total = parseInt(count);
            return total ? total : 0;
        }
        return 0;
    }
    /**
     * Initialize storage
     *
     * @param storage
     * @param key
     */
    function initCache(storage, key) {
        try {
            storage.setItem(versionKey, cacheVersion);
        }
        catch (err) {
            //
        }
        setCount(storage, key, 0);
    }
    /**
     * Destroy old cache
     *
     * @param storage
     */
    function destroyCache(storage) {
        try {
            const total = getCount(storage);
            for (let i = 0; i < total; i++) {
                storage.removeItem(cachePrefix + i);
            }
        }
        catch (err) {
            //
        }
    }
    /**
     * Load icons from cache
     */
    const loadCache = () => {
        if (loaded) {
            return;
        }
        loaded = true;
        // Minimum time
        const minTime = Math.floor(Date.now() / hour) - cacheExpiration;
        // Load data from storage
        function load(key) {
            const func = getGlobal(key);
            if (!func) {
                return;
            }
            // Get one item from storage
            const getItem = (index) => {
                const name = cachePrefix + index;
                const item = func.getItem(name);
                if (typeof item !== 'string') {
                    // Does not exist
                    return false;
                }
                // Get item, validate it
                let valid = true;
                try {
                    // Parse, check time stamp
                    const data = JSON.parse(item);
                    if (typeof data !== 'object' ||
                        typeof data.cached !== 'number' ||
                        data.cached < minTime ||
                        typeof data.provider !== 'string' ||
                        typeof data.data !== 'object' ||
                        typeof data.data.prefix !== 'string') {
                        valid = false;
                    }
                    else {
                        // Add icon set
                        const provider = data.provider;
                        const prefix = data.data.prefix;
                        const storage = storage_1.getStorage(provider, prefix);
                        valid = storage_1.addIconSet(storage, data.data);
                    }
                }
                catch (err) {
                    valid = false;
                }
                if (!valid) {
                    func.removeItem(name);
                }
                return valid;
            };
            try {
                // Get version
                const version = func.getItem(versionKey);
                if (version !== cacheVersion) {
                    if (version) {
                        // Version is set, but invalid - remove old entries
                        destroyCache(func);
                    }
                    // Empty data
                    initCache(func, key);
                    return;
                }
                // Get number of stored items
                let total = getCount(func);
                for (let i = total - 1; i >= 0; i--) {
                    if (!getItem(i)) {
                        // Remove item
                        if (i === total - 1) {
                            // Last item - reduce country
                            total--;
                        }
                        else {
                            // Mark as empty
                            exports.emptyList[key].push(i);
                        }
                    }
                }
                // Update total
                setCount(func, key, total);
            }
            catch (err) {
                //
            }
        }
        for (const key in exports.config) {
            load(key);
        }
    };
    exports.loadCache = loadCache;
    /**
     * Function to cache icons
     */
    const storeCache = (provider, data) => {
        if (!loaded) {
            exports.loadCache();
        }
        function store(key) {
            if (!exports.config[key]) {
                return false;
            }
            const func = getGlobal(key);
            if (!func) {
                return false;
            }
            // Get item index
            let index = exports.emptyList[key].shift();
            if (index === void 0) {
                // Create new index
                index = exports.count[key];
                if (!setCount(func, key, index + 1)) {
                    return false;
                }
            }
            // Create and save item
            try {
                const item = {
                    cached: Math.floor(Date.now() / hour),
                    provider,
                    data,
                };
                func.setItem(cachePrefix + index, JSON.stringify(item));
            }
            catch (err) {
                return false;
            }
            return true;
        }
        // Attempt to store at localStorage first, then at sessionStorage
        if (!store('local')) {
            store('session');
        }
    };
    exports.storeCache = storeCache;
    });

    var functions$3 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.toggleBrowserCache = void 0;

    /**
     * Toggle cache
     */
    function toggleBrowserCache(storage, value) {
        switch (storage) {
            case 'local':
            case 'session':
                browserStorage.config[storage] = value;
                break;
            case 'all':
                for (const key in browserStorage.config) {
                    browserStorage.config[key] = value;
                }
                break;
        }
    }
    exports.toggleBrowserCache = toggleBrowserCache;
    });

    var shorthand = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.alignmentFromString = exports.flipFromString = void 0;
    const separator = /[\s,]+/;
    /**
     * Apply "flip" string to icon customisations
     */
    function flipFromString(custom, flip) {
        flip.split(separator).forEach((str) => {
            const value = str.trim();
            switch (value) {
                case 'horizontal':
                    custom.hFlip = true;
                    break;
                case 'vertical':
                    custom.vFlip = true;
                    break;
            }
        });
    }
    exports.flipFromString = flipFromString;
    /**
     * Apply "align" string to icon customisations
     */
    function alignmentFromString(custom, align) {
        align.split(separator).forEach((str) => {
            const value = str.trim();
            switch (value) {
                case 'left':
                case 'center':
                case 'right':
                    custom.hAlign = value;
                    break;
                case 'top':
                case 'middle':
                case 'bottom':
                    custom.vAlign = value;
                    break;
                case 'slice':
                case 'crop':
                    custom.slice = true;
                    break;
                case 'meet':
                    custom.slice = false;
            }
        });
    }
    exports.alignmentFromString = alignmentFromString;
    });

    var rotate = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.rotateFromString = void 0;
    /**
     * Get rotation value
     */
    function rotateFromString(value) {
        const units = value.replace(/^-?[0-9.]*/, '');
        function cleanup(value) {
            while (value < 0) {
                value += 4;
            }
            return value % 4;
        }
        if (units === '') {
            const num = parseInt(value);
            return isNaN(num) ? 0 : cleanup(num);
        }
        else if (units !== value) {
            let split = 0;
            switch (units) {
                case '%':
                    // 25% -> 1, 50% -> 2, ...
                    split = 25;
                    break;
                case 'deg':
                    // 90deg -> 1, 180deg -> 2, ...
                    split = 90;
            }
            if (split) {
                let num = parseFloat(value.slice(0, value.length - units.length));
                if (isNaN(num)) {
                    return 0;
                }
                num = num / split;
                return num % 1 === 0 ? cleanup(num) : 0;
            }
        }
        return 0;
    }
    exports.rotateFromString = rotateFromString;
    });

    /**
     * Default SVG attributes
     */
    const svgDefaults = {
        'xmlns': 'http://www.w3.org/2000/svg',
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
        'aria-hidden': true,
        'role': 'img',
    };
    /**
     * Generate icon from properties
     */
    function render(
    // Icon must be validated before calling this function
    icon, 
    // Properties
    props) {
        const customisations$1 = customisations.mergeCustomisations(customisations.defaults, props);
        const componentProps = merge_1.merge(svgDefaults);
        // Create style if missing
        let style = typeof props.style === 'string' ? props.style : '';
        // Get element properties
        for (let key in props) {
            const value = props[key];
            if (value === void 0) {
                continue;
            }
            switch (key) {
                // Properties to ignore
                case 'icon':
                case 'style':
                case 'onLoad':
                    break;
                // Boolean attributes
                case 'inline':
                case 'hFlip':
                case 'vFlip':
                    customisations$1[key] =
                        value === true || value === 'true' || value === 1;
                    break;
                // Flip as string: 'horizontal,vertical'
                case 'flip':
                    if (typeof value === 'string') {
                        shorthand.flipFromString(customisations$1, value);
                    }
                    break;
                // Alignment as string
                case 'align':
                    if (typeof value === 'string') {
                        shorthand.alignmentFromString(customisations$1, value);
                    }
                    break;
                // Color: copy to style, add extra ';' in case style is missing it
                case 'color':
                    style =
                        style +
                            (style.length > 0 && style.trim().slice(-1) !== ';'
                                ? ';'
                                : '') +
                            'color: ' +
                            value +
                            '; ';
                    break;
                // Rotation as string
                case 'rotate':
                    if (typeof value === 'string') {
                        customisations$1[key] = rotate.rotateFromString(value);
                    }
                    else if (typeof value === 'number') {
                        customisations$1[key] = value;
                    }
                    break;
                // Remove aria-hidden
                case 'ariaHidden':
                case 'aria-hidden':
                    if (value !== true && value !== 'true') {
                        delete componentProps['aria-hidden'];
                    }
                    break;
                // Copy missing property if it does not exist in customisations
                default:
                    if (customisations.defaults[key] === void 0) {
                        componentProps[key] = value;
                    }
            }
        }
        // Generate icon
        const item = builder.iconToSVG(icon, customisations$1);
        // Add icon stuff
        for (let key in item.attributes) {
            componentProps[key] =
                item.attributes[key];
        }
        if (item.inline) {
            // Style overrides it
            style = 'vertical-align: -0.125em; ' + style;
        }
        // Style
        if (style !== '') {
            componentProps.style = style;
        }
        // Counter for ids based on "id" property to render icons consistently on server and client
        let localCounter = 0;
        const id = props.id;
        // Generate HTML
        return {
            attributes: componentProps,
            body: ids.replaceIDs(item.body, id ? () => id + '-' + localCounter++ : 'iconify-svelte-'),
        };
    }

    // Core
    /**
     * Enable and disable browser cache
     */
    const enableCache = (storage) => functions$3.toggleBrowserCache(storage, true);
    const disableCache = (storage) => functions$3.toggleBrowserCache(storage, false);
    /* Storage functions */
    /**
     * Check if icon exists
     */
    const iconExists = functions.storageFunctions.iconExists;
    /**
     * Get icon data
     */
    const getIcon = functions.storageFunctions.getIcon;
    /**
     * List available icons
     */
    const listIcons = functions.storageFunctions.listIcons;
    /**
     * Add one icon
     */
    const addIcon = functions.storageFunctions.addIcon;
    /**
     * Add icon set
     */
    const addCollection = functions.storageFunctions.addCollection;
    /* Builder functions */
    /**
     * Calculate icon size
     */
    const calculateSize = functions$1.builderFunctions.calculateSize;
    /**
     * Replace unique ids in content
     */
    const replaceIDs = functions$1.builderFunctions.replaceIDs;
    /**
     * Build SVG
     */
    const buildIcon = functions$1.builderFunctions.buildIcon;
    /* API functions */
    /**
     * Load icons
     */
    const loadIcons = functions$2.APIFunctions.loadIcons;
    /**
     * Add API provider
     */
    const addAPIProvider = functions$2.APIFunctions.addAPIProvider;
    /**
     * Export internal functions that can be used by third party implementations
     */
    const _api = functions$2.APIInternalFunctions;
    /**
     * Initialise stuff
     */
    // Enable short names
    functions.allowSimpleNames(true);
    // Set API
    modules.coreModules.api = api.API;
    // Use Fetch API by default
    let getAPIModule = fetch_1.getAPIModule;
    try {
        if (typeof document !== 'undefined' && typeof window !== 'undefined') {
            // If window and document exist, attempt to load whatever module is available, otherwise use Fetch API
            getAPIModule =
                typeof fetch === 'function' && typeof Promise === 'function'
                    ? fetch_1.getAPIModule
                    : jsonp.getAPIModule;
        }
    }
    catch (err) {
        //
    }
    modules$1.setAPIModule('', getAPIModule(config$1.getAPIConfig));
    /**
     * Function to enable node-fetch for getting icons on server side
     */
    _api.setFetch = (nodeFetch) => {
        fetch_1.setFetch(nodeFetch);
        if (getAPIModule !== fetch_1.getAPIModule) {
            getAPIModule = fetch_1.getAPIModule;
            modules$1.setAPIModule('', getAPIModule(config$1.getAPIConfig));
        }
    };
    /**
     * Browser stuff
     */
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        // Set cache and load existing cache
        modules.coreModules.cache = browserStorage.storeCache;
        browserStorage.loadCache();
        const _window = window;
        // Load icons from global "IconifyPreload"
        if (_window.IconifyPreload !== void 0) {
            const preload = _window.IconifyPreload;
            const err = 'Invalid IconifyPreload syntax.';
            if (typeof preload === 'object' && preload !== null) {
                (preload instanceof Array ? preload : [preload]).forEach((item) => {
                    try {
                        if (
                        // Check if item is an object and not null/array
                        typeof item !== 'object' ||
                            item === null ||
                            item instanceof Array ||
                            // Check for 'icons' and 'prefix'
                            typeof item.icons !== 'object' ||
                            typeof item.prefix !== 'string' ||
                            // Add icon set
                            !addCollection(item)) {
                            console.error(err);
                        }
                    }
                    catch (e) {
                        console.error(err);
                    }
                });
            }
        }
        // Set API from global "IconifyProviders"
        if (_window.IconifyProviders !== void 0) {
            const providers = _window.IconifyProviders;
            if (typeof providers === 'object' && providers !== null) {
                for (let key in providers) {
                    const err = 'IconifyProviders[' + key + '] is invalid.';
                    try {
                        const value = providers[key];
                        if (typeof value !== 'object' ||
                            !value ||
                            value.resources === void 0) {
                            continue;
                        }
                        if (!config$1.setAPIConfig(key, value)) {
                            console.error(err);
                        }
                    }
                    catch (e) {
                        console.error(err);
                    }
                }
            }
        }
    }
    /**
     * Check if component needs to be updated
     */
    function checkIconState(icon$1, state, mounted, callback, onload) {
        // Abort loading icon
        function abortLoading() {
            if (state.loading) {
                state.loading.abort();
                state.loading = null;
            }
        }
        // Icon is an object
        if (typeof icon$1 === 'object' &&
            icon$1 !== null &&
            typeof icon$1.body === 'string') {
            // Stop loading
            state.name = '';
            abortLoading();
            return { data: icon.fullIcon(icon$1) };
        }
        // Invalid icon?
        let iconName;
        if (typeof icon$1 !== 'string' ||
            (iconName = name.stringToIcon(icon$1, false, true)) === null) {
            abortLoading();
            return null;
        }
        // Load icon
        const data = functions.getIconData(iconName);
        if (data === null) {
            // Icon needs to be loaded
            // Do not load icon until component is mounted
            if (mounted && (!state.loading || state.loading.name !== icon$1)) {
                // New icon to load
                abortLoading();
                state.name = '';
                state.loading = {
                    name: icon$1,
                    abort: api.API.loadIcons([iconName], callback),
                };
            }
            return null;
        }
        // Icon data is available
        abortLoading();
        if (state.name !== icon$1) {
            state.name = icon$1;
            if (onload && !state.destroyed) {
                onload(icon$1);
            }
        }
        // Add classes
        const classes = ['iconify'];
        if (iconName.prefix !== '') {
            classes.push('iconify--' + iconName.prefix);
        }
        if (iconName.provider !== '') {
            classes.push('iconify--' + iconName.provider);
        }
        return { data, classes };
    }
    /**
     * Generate icon
     */
    function generateIcon(icon, props) {
        return icon ? render(icon, props) : null;
    }

    /* node_modules\@iconify\svelte\dist\Icon.svelte generated by Svelte v3.38.3 */
    const file$5 = "node_modules\\@iconify\\svelte\\dist\\Icon.svelte";

    // (94:0) {#if data !== null}
    function create_if_block(ctx) {
    	let svg;
    	let raw_value = /*data*/ ctx[0].body + "";
    	let svg_levels = [/*data*/ ctx[0].attributes];
    	let svg_data = {};

    	for (let i = 0; i < svg_levels.length; i += 1) {
    		svg_data = assign(svg_data, svg_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			set_svg_attributes(svg, svg_data);
    			add_location(svg, file$5, 94, 0, 1654);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			svg.innerHTML = raw_value;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*data*/ 1 && raw_value !== (raw_value = /*data*/ ctx[0].body + "")) svg.innerHTML = raw_value;			set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [dirty & /*data*/ 1 && /*data*/ ctx[0].attributes]));
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(94:0) {#if data !== null}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let if_block_anchor;
    	let if_block = /*data*/ ctx[0] !== null && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*data*/ ctx[0] !== null) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Icon", slots, []);

    	const state = {
    		// Last icon name
    		name: "",
    		// Loading status
    		loading: null,
    		// Destroyed status
    		destroyed: false
    	};

    	// Mounted status
    	let mounted = false;

    	// Callback counter
    	let counter = 0;

    	// Generated data
    	let data;

    	// Increase counter when loaded to force re-calculation of data
    	function loaded() {
    		$$invalidate(3, counter++, counter);
    	}

    	// Force re-render
    	onMount(() => {
    		$$invalidate(2, mounted = true);
    	});

    	// Abort loading when component is destroyed
    	onDestroy(() => {
    		$$invalidate(1, state.destroyed = true, state);

    		if (state.loading) {
    			state.loading.abort();
    			$$invalidate(1, state.loading = null, state);
    		}
    	});

    	$$self.$$set = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({
    		enableCache,
    		disableCache,
    		iconExists,
    		getIcon,
    		listIcons,
    		addIcon,
    		addCollection,
    		calculateSize,
    		replaceIDs,
    		buildIcon,
    		loadIcons,
    		addAPIProvider,
    		_api,
    		onMount,
    		onDestroy,
    		checkIconState,
    		generateIcon,
    		state,
    		mounted,
    		counter,
    		data,
    		loaded
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), $$new_props));
    		if ("mounted" in $$props) $$invalidate(2, mounted = $$new_props.mounted);
    		if ("counter" in $$props) $$invalidate(3, counter = $$new_props.counter);
    		if ("data" in $$props) $$invalidate(0, data = $$new_props.data);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		{
    			const iconData = checkIconState($$props.icon, state, mounted, loaded, $$props.onLoad);
    			$$invalidate(0, data = iconData ? generateIcon(iconData.data, $$props) : null);

    			if (data && iconData.classes) {
    				// Add classes
    				$$invalidate(
    					0,
    					data.attributes["class"] = (typeof $$props["class"] === "string"
    					? $$props["class"] + " "
    					: "") + iconData.classes.join(" "),
    					data
    				);
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);
    	return [data, state, mounted, counter];
    }

    class Icon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Icon",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    /* src\components\Tile.svelte generated by Svelte v3.38.3 */
    const file$4 = "src\\components\\Tile.svelte";

    // (11:8) <Reveal trigger="0.2" duration="1" reveal="fadeIn">
    function create_default_slot_2$2(ctx) {
    	let img;
    	let img_src_value;
    	let t0;
    	let p;

    	const block = {
    		c: function create() {
    			img = element("img");
    			t0 = space();
    			p = element("p");
    			p.textContent = `${"</>"}`;
    			if (img.src !== (img_src_value = "/avatar.webp")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "avatar");
    			attr_dev(img, "class", "svelte-1wt9fq7");
    			add_location(img, file$4, 11, 8, 235);
    			attr_dev(p, "class", "svelte-1wt9fq7");
    			add_location(p, file$4, 12, 8, 282);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, p, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$2.name,
    		type: "slot",
    		source: "(11:8) <Reveal trigger=\\\"0.2\\\" duration=\\\"1\\\" reveal=\\\"fadeIn\\\">",
    		ctx
    	});

    	return block;
    }

    // (17:4) <Reveal trigger="0.5" duration="1" reveal="fadeInDown">
    function create_default_slot_1$2(ctx) {
    	let div;
    	let h1;
    	let t0;
    	let br0;
    	let t1;
    	let br1;
    	let t2;
    	let h3;

    	const block = {
    		c: function create() {
    			div = element("div");
    			h1 = element("h1");
    			t0 = text("I'm A ");
    			br0 = element("br");
    			t1 = text("Frontend Developer ");
    			br1 = element("br");
    			t2 = space();
    			h3 = element("h3");
    			h3.textContent = "an Artist and a Music Producer.";
    			add_location(br0, file$4, 19, 18, 448);
    			attr_dev(h1, "class", "svelte-1wt9fq7");
    			add_location(h1, file$4, 19, 8, 438);
    			add_location(br1, file$4, 19, 46, 476);
    			attr_dev(h3, "class", "svelte-1wt9fq7");
    			add_location(h3, file$4, 20, 12, 494);
    			attr_dev(div, "class", "title svelte-1wt9fq7");
    			add_location(div, file$4, 17, 4, 399);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h1);
    			append_dev(h1, t0);
    			append_dev(h1, br0);
    			append_dev(h1, t1);
    			append_dev(div, br1);
    			append_dev(div, t2);
    			append_dev(div, h3);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$2.name,
    		type: "slot",
    		source: "(17:4) <Reveal trigger=\\\"0.5\\\" duration=\\\"1\\\" reveal=\\\"fadeInDown\\\">",
    		ctx
    	});

    	return block;
    }

    // (25:4) <Reveal trigger="0.2" duration="0.5" reveal="fadeInDown">
    function create_default_slot$2(ctx) {
    	let div;
    	let a0;
    	let iconify0;
    	let t0;
    	let a1;
    	let iconify1;
    	let t1;
    	let a2;
    	let iconify2;
    	let current;

    	iconify0 = new Icon({
    			props: { icon: "cib:twitter" },
    			$$inline: true
    		});

    	iconify1 = new Icon({
    			props: { icon: "cib:github" },
    			$$inline: true
    		});

    	iconify2 = new Icon({
    			props: { icon: "cib:spotify" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			a0 = element("a");
    			create_component(iconify0.$$.fragment);
    			t0 = space();
    			a1 = element("a");
    			create_component(iconify1.$$.fragment);
    			t1 = space();
    			a2 = element("a");
    			create_component(iconify2.$$.fragment);
    			attr_dev(a0, "class", "iconify svelte-1wt9fq7");
    			attr_dev(a0, "href", "https://twitter.com/Astrojajaja");
    			add_location(a0, file$4, 27, 12, 685);
    			attr_dev(a1, "class", "iconify svelte-1wt9fq7");
    			attr_dev(a1, "href", "https://github.com/");
    			add_location(a1, file$4, 31, 12, 837);
    			attr_dev(a2, "class", "iconify svelte-1wt9fq7");
    			attr_dev(a2, "href", "https://spotify.com");
    			add_location(a2, file$4, 35, 12, 975);
    			attr_dev(div, "class", "socialIcons svelte-1wt9fq7");
    			add_location(div, file$4, 26, 8, 646);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, a0);
    			mount_component(iconify0, a0, null);
    			append_dev(div, t0);
    			append_dev(div, a1);
    			mount_component(iconify1, a1, null);
    			append_dev(div, t1);
    			append_dev(div, a2);
    			mount_component(iconify2, a2, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconify0.$$.fragment, local);
    			transition_in(iconify1.$$.fragment, local);
    			transition_in(iconify2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconify0.$$.fragment, local);
    			transition_out(iconify1.$$.fragment, local);
    			transition_out(iconify2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(iconify0);
    			destroy_component(iconify1);
    			destroy_component(iconify2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$2.name,
    		type: "slot",
    		source: "(25:4) <Reveal trigger=\\\"0.2\\\" duration=\\\"0.5\\\" reveal=\\\"fadeInDown\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div1;
    	let div0;
    	let reveal0;
    	let t0;
    	let reveal1;
    	let t1;
    	let reveal2;
    	let current;

    	reveal0 = new Reveal({
    			props: {
    				trigger: "0.2",
    				duration: "1",
    				reveal: "fadeIn",
    				$$slots: { default: [create_default_slot_2$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal1 = new Reveal({
    			props: {
    				trigger: "0.5",
    				duration: "1",
    				reveal: "fadeInDown",
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal2 = new Reveal({
    			props: {
    				trigger: "0.2",
    				duration: "0.5",
    				reveal: "fadeInDown",
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(reveal0.$$.fragment);
    			t0 = space();
    			create_component(reveal1.$$.fragment);
    			t1 = space();
    			create_component(reveal2.$$.fragment);
    			attr_dev(div0, "class", "avatar svelte-1wt9fq7");
    			add_location(div0, file$4, 9, 4, 144);
    			attr_dev(div1, "class", "tile svelte-1wt9fq7");
    			add_location(div1, file$4, 6, 0, 112);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			mount_component(reveal0, div0, null);
    			append_dev(div1, t0);
    			mount_component(reveal1, div1, null);
    			append_dev(div1, t1);
    			mount_component(reveal2, div1, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const reveal0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal0_changes.$$scope = { dirty, ctx };
    			}

    			reveal0.$set(reveal0_changes);
    			const reveal1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal1_changes.$$scope = { dirty, ctx };
    			}

    			reveal1.$set(reveal1_changes);
    			const reveal2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal2_changes.$$scope = { dirty, ctx };
    			}

    			reveal2.$set(reveal2_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(reveal0.$$.fragment, local);
    			transition_in(reveal1.$$.fragment, local);
    			transition_in(reveal2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(reveal0.$$.fragment, local);
    			transition_out(reveal1.$$.fragment, local);
    			transition_out(reveal2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(reveal0);
    			destroy_component(reveal1);
    			destroy_component(reveal2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Tile", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Tile> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Reveal, Iconify: Icon });
    	return [];
    }

    class Tile extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Tile",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src\components\About.svelte generated by Svelte v3.38.3 */
    const file$3 = "src\\components\\About.svelte";

    // (8:4) <Reveal trigger="0.4" duration="0.5" reveal="fadeInLeft">
    function create_default_slot_4$1(ctx) {
    	let h2;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "About";
    			attr_dev(h2, "class", "svelte-18aqqj3");
    			add_location(h2, file$3, 7, 62, 250);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4$1.name,
    		type: "slot",
    		source: "(8:4) <Reveal trigger=\\\"0.4\\\" duration=\\\"0.5\\\" reveal=\\\"fadeInLeft\\\">",
    		ctx
    	});

    	return block;
    }

    // (10:4) <Reveal trigger="0.4" duration="0.7" reveal="fadeInUp">
    function create_default_slot_3$1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Lorem ipsum dolor sit amet consectetur adipisicing elit. Tempora nisi quam vitae perferendis fuga";
    			add_location(p, file$3, 10, 4, 342);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3$1.name,
    		type: "slot",
    		source: "(10:4) <Reveal trigger=\\\"0.4\\\" duration=\\\"0.7\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (13:4) <Reveal trigger="0.4" duration="0.7" reveal="fadeInUp">
    function create_default_slot_2$1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Lorem ipsum dolor sit amet consectetur adipisicing elit. Praesentium minus, ab voluptatibus possimus numquam odit animi eos.";
    			add_location(p, file$3, 13, 4, 532);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$1.name,
    		type: "slot",
    		source: "(13:4) <Reveal trigger=\\\"0.4\\\" duration=\\\"0.7\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (17:11) <Reveal trigger="0.35" duration="0.6" reveal="fadeInUp">
    function create_default_slot_1$1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Lorem ipsum dolor sit amet consectetur adipisicing elit. Praesentium minus, ab voluptatibus possimus numquam odit animi eos. Eligendi quaerat, voluptatem explicabo voluptatum accusamus nesciunt quia odio quos pariatur qui. Odit!";
    			add_location(p, file$3, 17, 8, 773);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$1.name,
    		type: "slot",
    		source: "(17:11) <Reveal trigger=\\\"0.35\\\" duration=\\\"0.6\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (6:0) <Reveal  trigger="0.4" duration="0.3" reveal="fadeInUp">
    function create_default_slot$1(ctx) {
    	let div;
    	let reveal0;
    	let t0;
    	let reveal1;
    	let t1;
    	let reveal2;
    	let t2;
    	let reveal3;
    	let current;

    	reveal0 = new Reveal({
    			props: {
    				trigger: "0.4",
    				duration: "0.5",
    				reveal: "fadeInLeft",
    				$$slots: { default: [create_default_slot_4$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal1 = new Reveal({
    			props: {
    				trigger: "0.4",
    				duration: "0.7",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal2 = new Reveal({
    			props: {
    				trigger: "0.4",
    				duration: "0.7",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal3 = new Reveal({
    			props: {
    				trigger: "0.35",
    				duration: "0.6",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(reveal0.$$.fragment);
    			t0 = space();
    			create_component(reveal1.$$.fragment);
    			t1 = space();
    			create_component(reveal2.$$.fragment);
    			t2 = space();
    			create_component(reveal3.$$.fragment);
    			attr_dev(div, "class", "about svelte-18aqqj3");
    			attr_dev(div, "id", "about");
    			add_location(div, file$3, 6, 0, 155);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(reveal0, div, null);
    			append_dev(div, t0);
    			mount_component(reveal1, div, null);
    			append_dev(div, t1);
    			mount_component(reveal2, div, null);
    			append_dev(div, t2);
    			mount_component(reveal3, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const reveal0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal0_changes.$$scope = { dirty, ctx };
    			}

    			reveal0.$set(reveal0_changes);
    			const reveal1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal1_changes.$$scope = { dirty, ctx };
    			}

    			reveal1.$set(reveal1_changes);
    			const reveal2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal2_changes.$$scope = { dirty, ctx };
    			}

    			reveal2.$set(reveal2_changes);
    			const reveal3_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal3_changes.$$scope = { dirty, ctx };
    			}

    			reveal3.$set(reveal3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(reveal0.$$.fragment, local);
    			transition_in(reveal1.$$.fragment, local);
    			transition_in(reveal2.$$.fragment, local);
    			transition_in(reveal3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(reveal0.$$.fragment, local);
    			transition_out(reveal1.$$.fragment, local);
    			transition_out(reveal2.$$.fragment, local);
    			transition_out(reveal3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(reveal0);
    			destroy_component(reveal1);
    			destroy_component(reveal2);
    			destroy_component(reveal3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(6:0) <Reveal  trigger=\\\"0.4\\\" duration=\\\"0.3\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let section;
    	let reveal;
    	let current;

    	reveal = new Reveal({
    			props: {
    				trigger: "0.4",
    				duration: "0.3",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			section = element("section");
    			create_component(reveal.$$.fragment);
    			attr_dev(section, "class", "about-container svelte-18aqqj3");
    			add_location(section, file$3, 4, 0, 62);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			mount_component(reveal, section, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const reveal_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal_changes.$$scope = { dirty, ctx };
    			}

    			reveal.$set(reveal_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(reveal.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(reveal.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_component(reveal);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("About", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<About> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Reveal });
    	return [];
    }

    class About extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "About",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src\components\Tech.svelte generated by Svelte v3.38.3 */
    const file$2 = "src\\components\\Tech.svelte";

    // (8:4) <Reveal trigger="0.5" duration="0.5" reveal="fadeInLeft">
    function create_default_slot_5(ctx) {
    	let h2;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Technologies";
    			attr_dev(h2, "class", "svelte-9xhp9r");
    			add_location(h2, file$2, 7, 61, 250);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_5.name,
    		type: "slot",
    		source: "(8:4) <Reveal trigger=\\\"0.5\\\" duration=\\\"0.5\\\" reveal=\\\"fadeInLeft\\\">",
    		ctx
    	});

    	return block;
    }

    // (10:4) <Reveal trigger="0.5" duration="0.7" reveal="fadeInUp">
    function create_default_slot_4(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Lorem ipsum dolor sit amet consectetur adipisicing elit. Tempora nisi quam vitae perferendis fuga, maxime odio consectetur repudiandae neque maiores ducimus sed, eligendi sunt rem porro reiciendis nulla voluptates! Sunt.";
    			add_location(p, file$2, 10, 4, 353);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(10:4) <Reveal trigger=\\\"0.5\\\" duration=\\\"0.7\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (13:4) <Reveal trigger="0.4" duration="0.9" reveal="fadeInUp">
    function create_default_slot_3(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Lorem ipsum dolor sit amet consectetur adipisicing elit. Praesentium minus, ab voluptatibus possimus numquam odit animi eos. Eligendi quaerat, voluptatem explicabo voluptatum accusamus nesciunt quia odio quos pariatur qui. Odit!";
    			add_location(p, file$2, 13, 4, 662);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(13:4) <Reveal trigger=\\\"0.4\\\" duration=\\\"0.9\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (18:8) <Reveal trigger="0.3" duration="0.9" reveal="fadeInUp">
    function create_default_slot_2(ctx) {
    	let div;
    	let icon0;
    	let t0;
    	let icon1;
    	let t1;
    	let icon2;
    	let current;

    	icon0 = new Icon({
    			props: { icon: "cib-html5" },
    			$$inline: true
    		});

    	icon1 = new Icon({
    			props: { icon: "simple-icons:css3" },
    			$$inline: true
    		});

    	icon2 = new Icon({
    			props: { icon: "cib:javascript" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(icon0.$$.fragment);
    			t0 = space();
    			create_component(icon1.$$.fragment);
    			t1 = space();
    			create_component(icon2.$$.fragment);
    			attr_dev(div, "class", "iconsA svelte-9xhp9r");
    			add_location(div, file$2, 18, 8, 1014);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(icon0, div, null);
    			append_dev(div, t0);
    			mount_component(icon1, div, null);
    			append_dev(div, t1);
    			mount_component(icon2, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon0.$$.fragment, local);
    			transition_in(icon1.$$.fragment, local);
    			transition_in(icon2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon0.$$.fragment, local);
    			transition_out(icon1.$$.fragment, local);
    			transition_out(icon2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(icon0);
    			destroy_component(icon1);
    			destroy_component(icon2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(18:8) <Reveal trigger=\\\"0.3\\\" duration=\\\"0.9\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (26:8) <Reveal trigger="0.3" duration="1.5" reveal="fadeInUp">
    function create_default_slot_1(ctx) {
    	let div;
    	let icon0;
    	let t0;
    	let icon1;
    	let t1;
    	let icon2;
    	let current;

    	icon0 = new Icon({
    			props: { icon: "cib:react" },
    			$$inline: true
    		});

    	icon1 = new Icon({
    			props: { icon: "logos:nextjs" },
    			$$inline: true
    		});

    	icon2 = new Icon({
    			props: { icon: "cib:svelte" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(icon0.$$.fragment);
    			t0 = space();
    			create_component(icon1.$$.fragment);
    			t1 = space();
    			create_component(icon2.$$.fragment);
    			attr_dev(div, "class", "iconsB svelte-9xhp9r");
    			add_location(div, file$2, 26, 8, 1276);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(icon0, div, null);
    			append_dev(div, t0);
    			mount_component(icon1, div, null);
    			append_dev(div, t1);
    			mount_component(icon2, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon0.$$.fragment, local);
    			transition_in(icon1.$$.fragment, local);
    			transition_in(icon2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon0.$$.fragment, local);
    			transition_out(icon1.$$.fragment, local);
    			transition_out(icon2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(icon0);
    			destroy_component(icon1);
    			destroy_component(icon2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(26:8) <Reveal trigger=\\\"0.3\\\" duration=\\\"1.5\\\" reveal=\\\"fadeInUp\\\">",
    		ctx
    	});

    	return block;
    }

    // (6:0) <Reveal trigger="0.35" duration="0.9" reveal="fadeIn">
    function create_default_slot(ctx) {
    	let section;
    	let reveal0;
    	let t0;
    	let reveal1;
    	let t1;
    	let reveal2;
    	let t2;
    	let div;
    	let reveal3;
    	let t3;
    	let reveal4;
    	let current;

    	reveal0 = new Reveal({
    			props: {
    				trigger: "0.5",
    				duration: "0.5",
    				reveal: "fadeInLeft",
    				$$slots: { default: [create_default_slot_5] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal1 = new Reveal({
    			props: {
    				trigger: "0.5",
    				duration: "0.7",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal2 = new Reveal({
    			props: {
    				trigger: "0.4",
    				duration: "0.9",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal3 = new Reveal({
    			props: {
    				trigger: "0.3",
    				duration: "0.9",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	reveal4 = new Reveal({
    			props: {
    				trigger: "0.3",
    				duration: "1.5",
    				reveal: "fadeInUp",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			section = element("section");
    			create_component(reveal0.$$.fragment);
    			t0 = space();
    			create_component(reveal1.$$.fragment);
    			t1 = space();
    			create_component(reveal2.$$.fragment);
    			t2 = space();
    			div = element("div");
    			create_component(reveal3.$$.fragment);
    			t3 = space();
    			create_component(reveal4.$$.fragment);
    			attr_dev(div, "class", "icons svelte-9xhp9r");
    			add_location(div, file$2, 16, 4, 920);
    			attr_dev(section, "class", "tech svelte-9xhp9r");
    			attr_dev(section, "id", "tech");
    			add_location(section, file$2, 6, 0, 155);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			mount_component(reveal0, section, null);
    			append_dev(section, t0);
    			mount_component(reveal1, section, null);
    			append_dev(section, t1);
    			mount_component(reveal2, section, null);
    			append_dev(section, t2);
    			append_dev(section, div);
    			mount_component(reveal3, div, null);
    			append_dev(div, t3);
    			mount_component(reveal4, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const reveal0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal0_changes.$$scope = { dirty, ctx };
    			}

    			reveal0.$set(reveal0_changes);
    			const reveal1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal1_changes.$$scope = { dirty, ctx };
    			}

    			reveal1.$set(reveal1_changes);
    			const reveal2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal2_changes.$$scope = { dirty, ctx };
    			}

    			reveal2.$set(reveal2_changes);
    			const reveal3_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal3_changes.$$scope = { dirty, ctx };
    			}

    			reveal3.$set(reveal3_changes);
    			const reveal4_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal4_changes.$$scope = { dirty, ctx };
    			}

    			reveal4.$set(reveal4_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(reveal0.$$.fragment, local);
    			transition_in(reveal1.$$.fragment, local);
    			transition_in(reveal2.$$.fragment, local);
    			transition_in(reveal3.$$.fragment, local);
    			transition_in(reveal4.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(reveal0.$$.fragment, local);
    			transition_out(reveal1.$$.fragment, local);
    			transition_out(reveal2.$$.fragment, local);
    			transition_out(reveal3.$$.fragment, local);
    			transition_out(reveal4.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_component(reveal0);
    			destroy_component(reveal1);
    			destroy_component(reveal2);
    			destroy_component(reveal3);
    			destroy_component(reveal4);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(6:0) <Reveal trigger=\\\"0.35\\\" duration=\\\"0.9\\\" reveal=\\\"fadeIn\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let reveal;
    	let current;

    	reveal = new Reveal({
    			props: {
    				trigger: "0.35",
    				duration: "0.9",
    				reveal: "fadeIn",
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(reveal.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(reveal, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const reveal_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				reveal_changes.$$scope = { dirty, ctx };
    			}

    			reveal.$set(reveal_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(reveal.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(reveal.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(reveal, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Tech", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Tech> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Icon, Reveal });
    	return [];
    }

    class Tech extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Tech",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src\components\Footer.svelte generated by Svelte v3.38.3 */

    const file$1 = "src\\components\\Footer.svelte";

    function create_fragment$1(ctx) {
    	let footer;
    	let div;
    	let h3;
    	let t0;
    	let br;
    	let span;

    	const block = {
    		c: function create() {
    			footer = element("footer");
    			div = element("div");
    			h3 = element("h3");
    			t0 = text("build v01");
    			br = element("br");
    			span = element("span");
    			span.textContent = "Prasad";
    			add_location(br, file$1, 3, 21, 62);
    			attr_dev(h3, "class", "svelte-xf4g0k");
    			add_location(h3, file$1, 3, 8, 49);
    			attr_dev(span, "class", "svelte-xf4g0k");
    			add_location(span, file$1, 3, 30, 71);
    			attr_dev(div, "class", "footerbox svelte-xf4g0k");
    			add_location(div, file$1, 2, 4, 16);
    			add_location(footer, file$1, 1, 0, 2);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, footer, anchor);
    			append_dev(footer, div);
    			append_dev(div, h3);
    			append_dev(h3, t0);
    			append_dev(h3, br);
    			append_dev(div, span);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Footer", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src\App.svelte generated by Svelte v3.38.3 */
    const file = "src\\App.svelte";

    function create_fragment(ctx) {
    	let div;
    	let main;
    	let tile;
    	let t0;
    	let about;
    	let t1;
    	let tech;
    	let t2;
    	let footer;
    	let current;
    	tile = new Tile({ $$inline: true });
    	about = new About({ $$inline: true });
    	tech = new Tech({ $$inline: true });
    	footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			main = element("main");
    			create_component(tile.$$.fragment);
    			t0 = space();
    			create_component(about.$$.fragment);
    			t1 = space();
    			create_component(tech.$$.fragment);
    			t2 = space();
    			create_component(footer.$$.fragment);
    			attr_dev(main, "class", "border svelte-18l6jgb");
    			add_location(main, file, 14, 0, 271);
    			attr_dev(div, "class", "grr svelte-18l6jgb");
    			add_location(div, file, 13, 0, 253);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, main);
    			mount_component(tile, main, null);
    			append_dev(main, t0);
    			mount_component(about, main, null);
    			append_dev(main, t1);
    			mount_component(tech, main, null);
    			append_dev(main, t2);
    			mount_component(footer, main, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(tile.$$.fragment, local);
    			transition_in(about.$$.fragment, local);
    			transition_in(tech.$$.fragment, local);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(tile.$$.fragment, local);
    			transition_out(about.$$.fragment, local);
    			transition_out(tech.$$.fragment, local);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(tile);
    			destroy_component(about);
    			destroy_component(tech);
    			destroy_component(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Tile, About, Tech, Footer });
    	return [];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
