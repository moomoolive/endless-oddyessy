// implementation heavily inspired by simondev
// https://github.com/simondevyoutube/ProceduralTerrain_Part3

export class Vec2 { 
    x: number 
    z: number

    constructor(x = 0.0, z = 0.0) {
        this.x = x
        this.z = z
    }

    distanceTo(comparison: Vec2) {
        const {x: cmpx, z: cmpz} = comparison
        const {x, z} = this
        return Math.sqrt((x - cmpx) ** 2 + (z - cmpz) ** 2)
    }

    clone() {
        return new Vec2(this.x, this.z)
    }
}

export class Box2 {
    min: Vec2
    max: Vec2

    constructor(min: Vec2, max: Vec2) {
        this.min = min
        this.max = max
    }

    center() {
        const {min, max} = this
        const diffx = (max.x - min.x) / 2
        const diffz = (max.z - min.z) / 2
        return new Vec2(min.x + diffx, min.z + diffz)
    }

    size() {
        const {min, max} = this
        const x = Math.abs(max.x - min.x)
        const z = Math.abs(max.z - min.z)
        return new Vec2(x, z)
    }
}

// an alias for node, more descriptive
interface LeafNode extends Node {}

class Node {
    bounds: Box2
    children: Node[]
    readonly center: Vec2
    readonly size: Vec2

    constructor(bounds: Box2) {
        this.bounds = bounds
        this.children = []
        this.center = bounds.center()
        this.size = bounds.size()
    }
}

export class Quadtree {
    root: Node
    minNodeSize: number

    constructor({
        min = new Vec2(),
        max = new Vec2(),
        minNodeSize = 16
    } = {}) {
        this.root = new Node(new Box2(min, max))
        this.minNodeSize = minNodeSize
    }

    insert(camera: Vec2) {
        return this.recursivelyInsert(
            this.root, camera, this.minNodeSize, 1
        )
    }

    private recursivelyInsert(
        child: Node, 
        camera: Vec2, 
        minNodeSize: number,
        depth: number
    ) {
        const distanceToChild = child.center.distanceTo(camera)
        if (distanceToChild < child.size.x && child.size.x > minNodeSize) {
            const children = this.createChildren(child)
            for (const newChild of children) {
                this.recursivelyInsert(
                    newChild, camera, minNodeSize, depth + 1
                )
            }
        }
    }

    private createChildren(child: Node) {
        const midpoint = child.center.clone()
        const bottomLeft = new Box2(
            child.bounds.min, 
            midpoint
        )
        const bottomRight = new Box2(
            new Vec2(midpoint.x, child.bounds.min.z),
            new Vec2(child.bounds.max.x, midpoint.z)
        )
        const topLeft = new Box2(
            new Vec2(child.bounds.min.x, midpoint.z),
            new Vec2(midpoint.x, child.bounds.max.z)
        )
        const topRight = new Box2(
            midpoint, 
            child.bounds.max
        )
        child.children.push(
            new Node(topLeft), new Node(topRight),
            new Node(bottomLeft), new Node(bottomRight)
        )
        return child.children
    }

    getChildren() {
        const children: LeafNode[] = []
        this.recursivelyGetLeafNodes(this.root, children)
        return children
    }

    private recursivelyGetLeafNodes(child: Node, output: Node[]) {
        if (child.children.length < 1 && child.size.x >= this.minNodeSize) {
            output.push(child)
            return
        }
        for (const c of child.children) {
            this.recursivelyGetLeafNodes(c, output)
        }
    }
}