import {Quadtree, Vec2, Box2} from "./quadTree"
import {fractionalBMotion, biome, voxel} from "./chunkManager"

const chunkkey = (x: number, z: number, size: number) => `${x}.${z}[${size}]`

type Chunk = {
    position: Vec2
    bounds: Box2
    dimensions: Vec2
}

export class TerrainManager {
    minNodeSize: number
    chunks: Record<string, Chunk>
    oldChunks: Chunk[]

    constructor({minNodeSize = 16} = {}) {
        this.minNodeSize = minNodeSize
        this.chunks = {}
        this.oldChunks = []
    }

    diffChunks(cameraX: number, cameraY: number) {
        const quadTree = new Quadtree({
            min: new Vec2(0, 0),
            max: new Vec2(4_600, 4_600),
            minNodeSize: this.minNodeSize
        })
        const camera = new Vec2(cameraX, cameraY)
        quadTree.insert(camera)
        const children = quadTree.getChildren()
        const newTerrainChunks: typeof this.chunks = {}
        for (const child of children) {
            const {center, size, bounds} = child
            const key = chunkkey(center.x, center.z, size.x)
            const chunk: Chunk = {
                position: center,
                bounds,
                dimensions: size
            }
            newTerrainChunks[key] = chunk
        }

        const intersection = {}
        const previousChunks = this.chunks
        for (const [key, chunk] of Object.entries(newTerrainChunks)) {
            if (previousChunks[key]) {
                intersection[key] = chunk
            }
        }

        const difference = {...newTerrainChunks}
        for (const key of Object.keys(difference)) {
            if (!previousChunks[key]) {
                delete difference[key]
            }
        }

        const recycle = {...previousChunks}
        for (const key of Object.keys(recycle)) {
            if (!newTerrainChunks[key]) {
                delete recycle[key]
            }
        }

        this.oldChunks.push(...Object.values(recycle))

        const currentTerrainChunks = intersection
        for (const key of Object.keys(difference)) {
            // add terrain chunks that are old to
            // current terrain chunks
        }

        this.chunks = currentTerrainChunks

    }
}