import {
    Scene, 
    Engine,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Texture,
    Mesh,
    CubeTexture,
    Color3,
    SceneLoader,
    ArcRotateCamera,
    Quaternion,
    CreateBox,
} from "babylonjs"
import 'babylonjs-loaders' // for gltf loader
import fpsMeter from "stats.js"
import {sweepBoxCollisions} from "./lib/physics/index"
import {Chunks} from "./lib/graphics/chunkManager"
import {
    lerp, toRadians, toDegrees, fpEqual, 
    createAxisRotation
} from "./lib/math/index"

const deceleration = new Vector3(-10.0, -0.0001, -10.0)

const main = async () => {
    const canvas = document.createElement("canvas")
    canvas.style.width = "100vw"
    canvas.style.height = "100vh"
    document.body.appendChild(canvas)
    
    const meter = new fpsMeter()
    meter.showPanel(0)
    document.body.appendChild(meter.dom)
    
    const engine = new Engine(canvas, true)
    const scene = new Scene(engine, {})
    
    const camera = new ArcRotateCamera(
        "camera", 
        -Math.PI / 2,
		1.2,
		35,
		new Vector3(0, 1, 0),
    )
    camera.lowerBetaLimit = 0.1
    camera.attachControl(canvas, true)
    camera.inputs.clear()
    const _light = new HemisphericLight(
        "light1", new Vector3(1.0, 1.0, 0.0), scene
    )

    const skybox = MeshBuilder.CreateBox(
        "skyBox", {size: 10_000.0}, scene
    )
	const skyboxMaterial = new StandardMaterial("skyBox", scene)
	skyboxMaterial.backFaceCulling = false
	skyboxMaterial.reflectionTexture = new CubeTexture(
        "./textures/resources/sky", scene
        )
	skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE
	skyboxMaterial.diffuseColor = new Color3(0, 0, 0)
	skyboxMaterial.specularColor = new Color3(0, 0, 0)
	skybox.material = skyboxMaterial	

    const boxMaterial = new StandardMaterial("grass", scene)
    boxMaterial.backFaceCulling = true
    boxMaterial.diffuseTexture = new Texture("./textures/grass-basic.png",)
    
    const playerModelPromise = SceneLoader.ImportMeshAsync(
        null, 
        "./assets/bfdi-nine/source/",
        "model.gltf", 
        scene
    )

    const chunkManager = new Chunks(1, 4, 4)
    if (!chunkManager.init(200.0, 200.0)) {
        console.warn("chunk generator failed to execute")
    }

    const controller = {
        left: false,
        right: false,
        forward: false,
        backward: false,
        up: false,
        down: false,
        frameCameraXRotation: 0.0,
        cameraLeft: false,
        cameraRight: false,
        frameCameraYRotation: 0.0,
        cameraUp: false,
        cameraDown: false,
        cameraZoomIn: false,
        cameraZoomOut: false
    }

    window.addEventListener("keydown", (e) => {
        if (e.repeat) {
            return
        }
        switch(e.key) {
            case "w":
                controller.forward = true
                break
            case "s":
                controller.backward = true
                break
            case "a":
                controller.left = true
                break
            case "d":
                controller.right = true
                break
            case " ":
                controller.up = true
                break
        }
    })

    window.addEventListener("keyup", (e) => {
        if (e.repeat) {
            return
        }
        switch(e.key) {
            case "w":
                controller.forward = false
                break
            case "s":
                controller.backward = false
                break
            case "a":
                controller.left = false
                break
            case "d":
                controller.right = false
                break
            case " ":
                controller.up = false
                break
        }
    })

    const mouseMovement = {
        deltaDegreesX: 0.0,
        deltaDegreesY: 0.0,
        currentXDegrees: 0.0,
        currentYDegrees: 0.0,
    }

    window.addEventListener("mousemove", (e) => {
        const move = mouseMovement
        move.currentXDegrees = 0.0
        move.currentYDegrees = 0.0
        const degreesPerPixel = 0.005
        move.deltaDegreesX = e.movementX * degreesPerPixel
        move.deltaDegreesY = e.movementY * degreesPerPixel
    })

    window.addEventListener("wheel", (e) => {
        const scroll = e.deltaY
        if (scroll < 0) {
            controller.cameraZoomIn = true
        } else {
            controller.cameraZoomOut = true
        }
    })

    window.addEventListener("resize", () => engine.resize())

    const playerStats = {
        rotation: 0
    }

    canvas.onclick  = () => canvas.requestPointerLock()

    const playerEntity = {
        transform: {x: 0.0, y: 0.0, z: 0.0},
        impulse: {x: 0.0, y: 0.0, z: 0.0},
        collider: {x: 0.5, y: 1.0, z: 0.5},
        kinematics: {mass: 10.0, gravityModifier: 1.0},
        velocity: {x: 0.0, y: 0.0, z: 0.0},
        acceleration: {x: 600.0, y: 0.25, z: 600.0},
        position: {x: 200.0, y: 100.0, z: 200.0},
        rendering: {id: 0},
    }

    const p = await playerModelPromise
    const player = p.meshes[0] as Mesh
    player.position.y -= 1.0
    player.rotationQuaternion!.multiplyInPlace(
        createAxisRotation(0.0, 1.0, 0.0, Math.PI)
    )
    player.bakeCurrentTransformIntoVertices()
    player.position = new Vector3(
        playerEntity.position.x, 
        playerEntity.position.y, 
        playerEntity.position.z
    )

    const boxCollider = CreateBox("boxCollider", {
        width: playerEntity.collider.x * 2,
        height: playerEntity.collider.y * 2,
        depth: playerEntity.collider.z * 2,
    }, scene)
    boxCollider.position.x = playerEntity.position.x
    boxCollider.position.y = playerEntity.position.y
    boxCollider.position.z = playerEntity.position.z

    const activeMeshes = [player, boxCollider]

    const GRAVITY = 1_080.0//9.8

    const movementVec = {horizontal: 0, vertical: 0, angle: 0}

    engine.runRenderLoop(() => {
        meter.begin()
        const deltaTime = engine.getDeltaTime()
        const deltaSeconds = deltaTime * 0.0001
        
        // input updates
        movementVec.horizontal = 0
        movementVec.vertical = 0

        if (controller.forward) {
            movementVec.horizontal += Math.cos(Math.PI - camera.alpha)
            movementVec.vertical += Math.sin(Math.PI - camera.alpha)
        }
    
        if (controller.backward) {
            movementVec.horizontal += Math.cos(Math.PI * 2 - camera.alpha)
            movementVec.vertical += Math.sin(Math.PI * 2 - camera.alpha)
        }
    
        if (controller.left) {
            movementVec.horizontal += Math.cos(Math.PI / 2 - camera.alpha)
            movementVec.vertical += Math.sin(Math.PI / 2 - camera.alpha)
        }
    
        if (controller.right) {
            movementVec.horizontal += Math.cos(3 * Math.PI / 2 - camera.alpha)
            movementVec.vertical += Math.sin(3 * Math.PI / 2 - camera.alpha)
        } 
        
        movementVec.angle = Math.atan2(movementVec.vertical, movementVec.horizontal) / (Math.PI / 180)
        
        // process mouse movement (controller adaptor)
        {
            const {
                deltaDegreesX, currentXDegrees, 
                deltaDegreesY, currentYDegrees
            } = mouseMovement
            
            if (currentXDegrees > deltaDegreesX) {
                controller.cameraLeft = true
                const t = 1 - Math.pow(0.001, deltaTime)
                const newXDegrees = lerp(
                    Math.abs(currentXDegrees), Math.abs(deltaDegreesX), t
                )
                const degreeDiff = newXDegrees - currentXDegrees
                mouseMovement.currentXDegrees -= degreeDiff
                controller.frameCameraXRotation = degreeDiff
            } else {
                controller.cameraLeft = false
            }

            if (currentXDegrees < deltaDegreesX) {
                controller.cameraRight = true
                const t = 1 - Math.pow(0.001, deltaTime)
                const newXDegrees = lerp(
                    currentXDegrees, deltaDegreesX, t
                )
                const degreeDiff = newXDegrees - currentXDegrees
                mouseMovement.currentXDegrees += degreeDiff
                controller.frameCameraXRotation = degreeDiff
            } else {
                controller.cameraRight = false
            }

            if (currentYDegrees > deltaDegreesY) {
                controller.cameraDown = true
                const t = 1 - Math.pow(0.001, deltaTime)
                const newYDegrees = lerp(
                    Math.abs(deltaDegreesY), Math.abs(deltaDegreesY), t
                )
                const degreeDiff = newYDegrees - currentXDegrees
                mouseMovement.currentYDegrees -= degreeDiff
                controller.frameCameraYRotation = degreeDiff
            } else {
                controller.cameraDown = false
            }

            if (currentYDegrees < deltaDegreesY) {
                controller.cameraUp = true
                const t = 1 - Math.pow(0.001, deltaTime)
                const newYDegrees = lerp(
                    deltaDegreesY, deltaDegreesY, t
                )
                const degreeDiff = newYDegrees - currentXDegrees
                mouseMovement.currentYDegrees += degreeDiff
                controller.frameCameraYRotation = degreeDiff
            } else {
                controller.cameraUp = false
            }

            if (controller.cameraZoomIn) {
                camera.radius += 2.0
                controller.cameraZoomIn = false 
            } else if (controller.cameraZoomOut) {
                camera.radius -= 2.0
                controller.cameraZoomOut = false
            }
        }

        // camera rotation & positioning
        {
            if (controller.cameraLeft) {
                camera.alpha += controller.frameCameraXRotation
            } else if (controller.cameraRight) {
                camera.alpha -= controller.frameCameraXRotation
            }
            if (controller.cameraUp && camera.beta < Math.PI / 1.98) {
                camera.beta += controller.frameCameraYRotation
            } else if (controller.cameraDown) {
                camera.beta -= controller.frameCameraYRotation
            }

            const {x, y, z} = playerEntity.position
            camera.target.set(x, y + 1.5, z)
        }
        
        // movement
        {
            const frameDecleration = new Vector3(
                playerEntity.velocity.x * deceleration.x,
                playerEntity.velocity.y * deceleration.y,
                playerEntity.velocity.z * deceleration.z,
            )
            frameDecleration.x *= deltaSeconds
            frameDecleration.y *= deltaSeconds
            frameDecleration.z *= deltaSeconds
            frameDecleration.z = (
                Math.sign(frameDecleration.z) 
                * Math.min(Math.abs(frameDecleration.z), Math.abs(playerEntity.velocity.z))
            )
        
            playerEntity.velocity.x += frameDecleration.x
            playerEntity.velocity.y += frameDecleration.y
            playerEntity.velocity.z += frameDecleration.z
        
            if (
                controller.forward || controller.backward ||
                controller.left || controller.right
            ) {
                playerEntity.velocity.z += playerEntity.acceleration.z * deltaSeconds * - movementVec.vertical
                playerEntity.velocity.x += playerEntity.acceleration.x * deltaSeconds * movementVec.horizontal
        
                /* I cannot get the model to line up with camera for some reason
                    fix this later
                */
                const angleRotation = movementVec.angle + 90.0
                if (!fpEqual(playerStats.rotation, angleRotation, 0.5)) {
                    const t = 1 - Math.pow(0.99, deltaTime)
                    const rotation = Quaternion.Slerp(
                        player.rotationQuaternion!,
                        createAxisRotation(0.0, 1.0, 0.0, toRadians(movementVec.angle + 90.0)),
                        t
                    )
                    playerStats.rotation = toDegrees(rotation.toEulerAngles().y)
                    player.rotationQuaternion = rotation
                }
        
            }

            const {impulse, kinematics} = playerEntity
            if (controller.up) {
                impulse.y += kinematics.mass * (GRAVITY * deltaSeconds * 2.0)
            }
        }

        // check for collisions
        {   
            const {impulse, velocity, kinematics} = playerEntity

            velocity.x += impulse.x / kinematics.mass
            velocity.y += impulse.y / kinematics.mass
            velocity.z += impulse.z / kinematics.mass

            // reset forces for next frame
            impulse.x = impulse.y = impulse.z = 0.0

            const res = sweepBoxCollisions(
                playerEntity.position,
                playerEntity.collider, 
                chunkManager,
                playerEntity.velocity.x * deltaSeconds,
                playerEntity.velocity.y * deltaSeconds,
                playerEntity.velocity.z * deltaSeconds,
            )
            const {transform} = res

            playerEntity.transform.x = transform.x
            playerEntity.transform.y = transform.y
            playerEntity.transform.z = transform.z

            if (res.touchedX) {
                const stoppingImpulse = kinematics.mass * - velocity.x
                impulse.x += stoppingImpulse
            }
            const {position, collider} = playerEntity
            if (res.touchedY) {
                const stoppingImpulse = kinematics.mass * - velocity.y
                impulse.y += stoppingImpulse
            } else if (!chunkManager.isVoxelSolid(
                Math.floor(position.x), 
                Math.floor(position.y - collider.y - 1.0), 
                Math.floor(position.z)
            )) {
                impulse.y += kinematics.mass * -(GRAVITY * deltaSeconds * kinematics.gravityModifier)
            }

            if (res.touchedZ) {
                const stoppingImpulse = kinematics.mass * - velocity.z
                impulse.z += stoppingImpulse
            }
        }

        // apply transforms
        {
            playerEntity.position.x += playerEntity.transform.x
            playerEntity.position.y += playerEntity.transform.y
            playerEntity.position.z += playerEntity.transform.z
        }

        // apply visual changes
        {
            const player = activeMeshes[playerEntity.rendering.id]
            player.position.x = playerEntity.position.x
            player.position.z = playerEntity.position.z
            player.position.y = playerEntity.position.y

            // debug
            boxCollider.position.x = playerEntity.position.x
            boxCollider.position.y = playerEntity.position.y
            boxCollider.position.z = playerEntity.position.z
        }

        {
            const {x, z} = player.position
            chunkManager.diffChunks(x, z)
        }

        // render world
        scene.render()
        meter.end()
    })
}   

main()
