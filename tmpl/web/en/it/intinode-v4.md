---
title: "Internet Inodes: One Copy of a File for Every Application"
description: "A proposal for sharing immutable files across applications, containers, and virtual machines through hash-addressed internet inodes."
date: "2026-10-09"
id: "intinode-v4"
version: "v4"
source: "https://github.com/talgatiko/intinode_1/blob/main/README.md"
source_sha256: "e53829c93e836cb4412c1fbf135a8937431016b4973ae90d49f3a5d8e5ecf21a"
author: "Талгат Зайниев"
license: "CC BY 4.0"
original_language: "ru"
---

[RU HTML](https://talgatiko.github.io/ru/it/intinode-v4/) · [RU Markdown](https://talgatiko.github.io/ru/it/intinode-v4.md) · [EN HTML](https://talgatiko.github.io/en/it/intinode-v4/) · [EN Markdown](https://talgatiko.github.io/en/it/intinode-v4.md)

# Internet Inodes: One Copy of a File for Every Application

**Author:** Талгат Зайниев.

**Version:** v4, 9 October 2026.

**Source:** [Internet Inodes repository](https://github.com/talgatiko/intinode_1).

**Original language:** Russian. This English text is a translation; the Russian version is authoritative wherever the meanings differ.

**Article license:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.en). You may share and adapt the text with attribution and a link to the source.

## Part I. A Two-Megabyte Application Instead of Two Gigabytes

You want to try a new program, but the button says “Install” next to a 2 GB download. You have to wait, find disk space, and download libraries again even though they arrived with other applications. Large packages are annoying even when the program itself is useful.

Now imagine a 2 MB Flatpak package instead of 2 GB. It contains the application's file tree and short records describing its files. On the first install, the system obtains the missing files and immediately reuses anything already present in your computer's shared cache. In lazy mode, files are fetched as they are accessed; prefetching can obtain the whole set in advance.

One editor has already brought in the required version of Qt, and another program has brought in Python. The new application reuses those files from the cache. The package is small, while the familiar interface and capabilities remain the same. The same idea works for Docker containers and virtual machine images.

**An internet inode, or intinode, is a service record that links a file to its content by hash. The operating system recognizes the record and supplies the required bytes to an application from a shared cache, fetching them on demand.**

### Where the Extra Gigabytes Come From

A server runs one hundred virtual machines. Each has its own disk, operating system, and applications. Yet the same files keep appearing on those disks: system libraries, interpreters, utilities, and executables. A 20 MB library takes up 2 GB across one hundred machines even though its contents are identical everywhere.

The same thing happens in containers and application packages. Several images contain the same version of Python; several desktop programs ship with the same Qt libraries. Separate packaging is convenient for installation and isolation, but it also puts duplicate copies of the same bytes on disk.

Storage vendors are familiar with the scale of this duplication. StarWind estimates that duplicate data in virtual desktop infrastructure (VDI) is close to 90%. For virtualization image libraries, Microsoft gives a typical deduplication saving of 80–95%. The 85–90% reference point concerns the volume of repeated data in environments of this kind. [StarWind](https://www.starwindsoftware.com/resource-library/whitepapers/Deduplication-and-Compression.pdf), [Microsoft](https://learn.microsoft.com/en-us/windows-server/storage/data-deduplication/overview).

A program accesses a familiar name, such as `/usr/lib/libexample.so`. The kernel finds the required content and passes it to the program. The application keeps its familiar paths, while the system can store identical bytes only once.

### What Is Inside the File

An ordinary file contains its content. An image can instead store an internet inode in its place: a short text record with a hash, size, and source information.

The name combines two concepts: inode, a filesystem structure that associates file attributes with information about its data, and Internet, the interconnection of networks. An internet inode moves the reference to content beyond a particular disk. The same record can be stored in a file on disk, appear as a line in a manifest, or serve as an example in documentation.

The hash acts as a stable identifier. Two copies of the same library have the same SHA-256 and refer to one cache object. Their file names and installation locations may differ: one program expects the library in `/usr/lib`, another in its own directory. Each retains its own file tree, while identical content is stored once.

The source address answers where to get the file. The hash answers which exact file is needed. This makes it possible to fetch identical content from different mirrors and verify the result after transfer.

### How an Application Starts

Imagine a container running a web server. Its image contains directories, permissions, settings, and internet inodes for the executable and its libraries.

At startup, the kernel reads the web server's internet inode and checks the shared cache. If another container has already fetched the object, startup continues with the ready file. If the object is absent, the `intinode-fetchd` daemon retrieves it from storage, checks its size and hash, and puts it in the cache. During this time, the startup operation waits in the kernel for the data to become ready.

The required libraries are opened in the same way. Files the application never accesses remain short internet inodes. The next container reuses the objects that have already been fetched.

When a library is updated, it gets a new hash and a separate object; programs using the old version continue to use their existing content. Updated and previous versions can coexist in the shared cache.

### Why the Change Belongs in the Kernel

The operating system supplies files to applications. The kernel already handles reading, launching executable files, and mapping files into memory. Supporting intinode in this shared layer lets existing applications use their ordinary file operations.

The filesystem stores an internet inode as an ordinary file. It can reside in ext4, XFS, Btrfs, or inside an image filesystem: the intinode marker is in the file's contents. After reading the header, the kernel recognizes it and links the name in the application's tree to a cache object.

This is the reason for choosing this implementation layer: one kernel mechanism serves millions of programs that have already been written. For Linux, the proposal includes the `intinode.ko` module, a fetching daemon, and image preparation utilities.

The principle can be implemented in any operating system. An internet inode defines how content is described and obtained; each OS connects it to its own file-access mechanism. The record format and data-transfer protocol are shared, while kernel integration depends on the system.

### One Cache for Virtual Machines

Containers use the host kernel and its shared cache. Virtual machines have their own kernels, so intinode support resides in each guest OS.

When a guest needs a file, it sends a request to the host system over the virtual network. The host acts as a proxy: it finds the object in the shared cache or fetches it from an external source. The guest reads the ready content from the host. A persistent copy on every VM's disk is not required; working pages are placed in the guest's RAM as usual.

This lets one hundred independent machines have one hundred separate names and sets of attributes for a library while keeping one stored copy of its content on the host.

The primary use for intinode is immutable executables and resources: system images, containers, libraries, and AppImage, Flatpak, and Snap packages prepared with internet inodes. Their shared sets of files are well suited to hash-based storage. Mutable application data goes in its own writable layer.

A private image can also become smaller. For example, a closed-source program remains an ordinary file inside the image, while public Python, Qt, and other shared dependencies are represented by internet inodes. Private settings and data are stored as usual. The builder selects only shared, immutable files intended for publication as internet inodes.

### What an Ordinary User Gets

For someone at a computer, the result appears in everyday actions: installing a program, trying another one, updating several applications, or taking a laptop on a trip.

| Advantage | What it looks like |
| --- | --- |
| Small application packages | A compact package of internet inodes arrives first; ready files are taken from the cache |
| Fewer repeated downloads | A library already fetched for another application is reused |
| Less disk space used | Several applications share one copy of identical content |
| Easier updates | The system fetches new files and reuses unchanged ones from the cache |

| Cost | How it appears |
| --- | --- |
| Waiting for the first fetch | With an empty cache, the required files arrive over the network. This work is comparable to a conventional application install and can be done in advance |
| Extra work when opening a file | The system recognizes the internet inode and looks up the object by hash. For a ready local cache, the expected service overhead is on the microsecond scale |

Over time, the shared cache becomes a collection of files used by your applications. The more ready content it contains, the less needs to be fetched during the next installation.

### The Biggest Gain Is for Cloud Providers

In the cloud, the same mechanism operates across thousands of program instances. Small images spread quickly across a cluster, and worker nodes build up a shared catalog of verified files. New containers use this catalog alongside those already running.

A container like this can be distributed as one layer containing the final file tree. It already specifies all directories, paths, permissions, and ordinary application files; shared programs and libraries are represented by direct internet inodes. A small image describes the system's final state; identical content across images is deduplicated by the hashes of individual files.

In Kubernetes, pods run on worker nodes—physical or virtual machines. An intinode cache serves the pods on one node. For a virtual node, the cache can reside on the host OS, as in the VM arrangement described above. [Kubernetes node architecture](https://kubernetes.io/docs/concepts/architecture/nodes/).

| Advantage | What the provider gets |
| --- | --- |
| Compact container and VM images | A small file tree containing internet inodes is transferred over the network |
| Reuse of the node cache | Files already available to a node immediately serve new pods and containers |
| Less content transfer | A node fetches only objects missing from its cache |
| Storage savings | Shared libraries and programs are stored once for many instances |
| Higher placement density | Freed space can be used for other workloads |

| Cost | How it appears |
| --- | --- |
| A possible increase in first-start time | With an empty cache, sequential application accesses trigger network fetches. Total time depends on the working set and source availability |
| Shared-cache operations | A node needs cache storage and management of its size |

Intinode support can be added to an existing Kubernetes cluster: prepare worker nodes with the kernel module, daemon, and shared cache, and add single-layer image creation to the application build. Pods continue to be scheduled by the cluster's ordinary rules, and the node kernel handles their file accesses. For selected workloads, the orchestrator can also start a prefetch operation.

### Application Installation Could Work Differently

Flatpak package sizes often become an obstacle before someone has even tried the program. A compact intinode package makes the first step simple: fetch the application description, reuse files already available, and fetch the missing ones.

In the future, an installer could work with a system-wide shared content catalog. An application would add its own file tree and any newly required objects. The user would still click “Install,” but behind that button the system would assemble the program from verified files, some of which are already nearby.

## Part II. How intinode Works

The sections below describe the internet inode structure and the system's algorithm. The record format and transport allow several implementation choices. The selected unit of fetching is a whole file: it first arrives in the cache and is fully verified, then becomes available for reading and execution. This order provides one verified object for every access method.

### 1. Internet Inode, Logical File, and Content Object

The mechanism involves three entities:

| Entity | What it contains | What it is responsible for |
| --- | --- | --- |
| Internet inode | The `intinode ` prefix and service fields | Links a record in the file tree to its content |
| Logical file | Name, owner, permissions, attributes, and content size | The representation visible to an application |
| Content object | Verified, immutable bytes | A shared data source for files with the same hash |

Owner, group, access mode, ACLs, and security attributes belong to a file in its file tree. The content size comes from the internet inode. Thus, `stat()` and `fstat()` report the size of the library or program that the application opens.

The physical length of the service record is tracked separately from the logical length. The on-disk size field remains the size of the internet inode; intinode support constructs logical attributes in the kernel's shared file layer. The logical length is also used by internal kernel operations: determining end of file, preparing execution, and checking the bounds of a memory mapping. Internet inodes and the shared cache are accounted for separately when measuring space used.

Two logical files with the same hash can have different names and permissions. Access checks are performed for each of them in its respective namespace, taking security attributes and mount flags into account, including `noexec` and `nosuid`. The cache provides content for the already-open logical file.

### 2. Internet Inode Format

An internet inode is deliberately stored as one line of printable text. For compatibility with ANSI encodings, it uses characters from the common ASCII range: Latin letters, digits, and ordinary text separators. Addresses containing other characters are represented in their corresponding ASCII form. This lets the same record be stored in a file body, passed as a string, or included in documentation.

The record is recognized by the eight-ASCII-byte prefix `intinode` followed by a space. The maximum size of the short record is 200 bytes. The final field layout will be chosen when the format is standardized.

Three options are under consideration:

| Format | Advantage | Feature |
| --- | --- | --- |
| JSON | Fields are explicitly named, and the record is easy to read and extend | Field names and structural characters consume bytes |
| Delimited string | Compact record and simple sequential parsing | Field order and delimiter escaping are defined by the specification |
| Fixed byte positions | Fields are read from known offsets | Each field has a defined width; extensions are coordinated with the record version |

In all three options, the content remains printable text. Fixed layout means fixed character positions in the string.

Example JSON record for the five bytes `hello`:

```text
intinode {"digest":"sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824","size":5,"urls":["https://o.example/f1"]}
```

The same basic information in a delimited string:

```text
intinode sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824|5|https://o.example/f1
```

The meaning of the fields remains the same regardless of encoding. The field names from the JSON example are used below:

| Field | Purpose |
| --- | --- |
| `digest` | Algorithm and hash of the complete uncompressed content; for SHA-256, 64 hexadecimal characters |
| `size` | Size of the uncompressed content in bytes |
| `urls` | Source addresses for the object, in preference order |
| `compressed` | Indicates a compressed representation at the source |
| `compression_algo` | Decompression algorithm: `zstd` or `gzip` |
| `compressed_size` | Size of the compressed representation in bytes |

The first three fields are mandatory. Compression fields describe object transfer. The cache stores uncompressed content, and `digest` and `size` always refer to the bytes the application receives.

The parser operates within the configured record-size limit and checks field types, hash format, and the permitted size range. Network addresses are passed to the daemon as fetch data. Protocol parsing and decompression run in user space.

To recognize an internet inode, the module reads its header through lower-level filesystem operations. Service access to internet inodes and ready cache objects returns their physical bytes. Application access to the logical file returns the content of the associated object.

### 3. Kernel Module and Daemon

`intinode.ko` recognizes internet inodes, links logical files to objects, waits for readiness, and handles file operations. Support in the shared VFS layer directs detected intinode files to the module. The underlying filesystem continues to store files and directories in its ordinary format.

VFS provides operations on an open file, including `read_iter`, positioning, and memory mapping. For intinode, these are the attachment points for the content source and logical attributes. [VFS documentation](https://docs.kernel.org/filesystems/vfs.html).

For an open file, the kernel holds two references: one to the record in the tree, which determines its identity and permissions, and one to the object that supplies its bytes. Read handlers use the second reference; name and access checks use the first. For `mmap()`, the kernel sets up a mapping of the verified object and holds its lifetime.

`intinode-fetchd` receives jobs from the module, selects a source, fetches and decompresses the content, verifies the result, and manages the cache. Its network handlers run with minimal privileges; objects are published through controlled access to the cache directory.

One possible kernel–daemon interface is the `/dev/intinode` character device. The daemon reads jobs from it containing a request ID, hash, size, and source addresses. After processing, it reports the result through `ioctl`; for a local cache it passes an open descriptor for the verified object. The kernel takes a reference to that file and wakes waiting operations. This keeps the object itself alive instead of looking it up again by name after notification.

### 4. First Access and Concurrent Requests

A shared state is maintained for each hash:

```text
ABSENT → FETCHING → VERIFYING → READY
                   ↘ FAILED
```

An error at any stage moves the request to `FAILED`. Retry attempts follow the daemon's retry rules. The state key is the pair “algorithm, hash.”

The algorithm for opening a file for reading or execution is:

1. The kernel opens the file in the process's tree, performs access checks, and recognizes the internet inode.
2. It checks the service-record format, extracts the content size and hash, and looks up the object by key.
3. For a ready object, it checks its length against `size`, holds a reference, and links it to the open logical file.
4. For a missing object, it creates one job for the daemon. Other accesses to the same hash join the existing request.
5. The operation waits for completion. The daemon fetches the file, verifies it, and publishes the object.
6. The kernel changes the state to `READY`, wakes waiters, and completes the open with a ready data source.

Metadata operations use the internet inode without fetching content. Thus, traversing a tree, reading attributes, and estimating logical sizes do not turn into prefetching the entire image.

This algorithm applies on any file access, including after a program has been running for a long time—for example, when it opens a plugin or localization file.

Waiting is implemented through a wait queue or completion. Locks protect short state transitions; during a network fetch the thread sleeps with the locks released. Linux completions are specifically intended for waiting until another thread finishes its work. [Completions documentation](https://docs.kernel.org/scheduler/completion.html).

Waiting can be interrupted by a signal or a deadline. A fetch error is returned through the ordinary result of the file operation, while the daemon records the detailed cause: unavailable source, hash mismatch, size limit exceeded, or insufficient space. Cancellation of one waiting process is handled separately from the shared fetch that other processes may also be waiting for.

### 5. Reading, Execution, and Memory Mapping

After the file is opened, its content is served through the held object:

| Operation | intinode behavior |
| --- | --- |
| `read()`, `pread()` | Return object bytes from the corresponding position |
| `lseek()` | Uses the logical file length |
| `execve()` | Receives verified bytes before the program or script header is parsed |
| `mmap()` | Creates a mapping of verified content; pages are loaded by the ordinary memory mechanism |
| `sendfile()`, `splice()`, copying | Transfer object content while respecting the logical file's size and offsets |

Internal kernel reads matter for execution. The Linux loader reads the start of a file through `kernel_read()` while preparing `linux_binprm`. At this point it must receive the ELF or script header from the content object. Intinode support therefore covers the common file-reading path, including reads performed by the kernel itself. [Linux loader source](https://github.com/torvalds/linux/blob/master/fs/exec.c).

With `mmap()`, the object has already been fully verified in the cache. Subsequent page faults obtain the required pages from the local or network file that provides the content. Linux associates file mappings with the page cache; the object must remain alive while related mappings exist. [Linux file-mapping source](https://github.com/torvalds/linux/blob/master/mm/filemap.c).

Several containers on one kernel can access the same object and its pages. In different virtual machines, pages reside in each guest's memory, while persistent content is kept in the host's shared cache.

### 6. Verification and Cache Publication

The content registry is the primary source of published shared files. A local or host cache stores their verified copies and speeds up repeat access. If an object is missing, the daemon retrieves it from the registry; the specific storage and protocol are chosen for the infrastructure.

The object path looks like this:

```text
/var/cache/intinode/sha256/<64-character-hash>
```

The daemon creates a temporary file on the same filesystem, fetches the data, and decompresses it if necessary. It computes SHA-256 over the uncompressed stream and counts the bytes received. Decompression is limited by the declared object size.

The object becomes ready after both its size and hash match. The daemon then completes the write, sets the immutable-object mode, and atomically publishes it under its hash name. To preserve it across a restart, the file and directory entry are synchronized. Only a published object is moved to `READY`.

Writes to cache objects are available to the components that manage the cache. Applications read content through their own logical files. The cache manager removes whole objects; a new version of content gets a new hash and name.

When choosing eviction candidates, the system considers recency and access frequency. Open files, memory mappings, and active network readers keep an object alive. Prefetched sets for offline operation can be pinned in the cache while in use.

If an object is evicted from the cache, the next access fetches it again from the registry and verifies it.

After a restart, the daemon rebuilds its index from completed objects. Incomplete temporary files are not included in the ready index. Content verification is also used during recovery and when detecting storage corruption.

### 7. Virtual Machine and Host Proxy

The guest OS runs `intinode.ko` and an `intinode-fetchd` component that connects the kernel to the host. A host proxy with the host OS's shared cache serves file requests from guests:

```text
Application in a VM
    ↓ file operation
Guest kernel + intinode.ko
    ↓ request via guest daemon
Virtual network
    ↓
Host proxy + intinode-fetchd
    ↓                 ↓ if object is missing
Host shared cache    remote disk / OCI / IPFS / S3 / HTTP
```

The guest daemon sends the host the hash, size, and source information. The host combines identical requests from different VMs, fetches and verifies the object, and reports when it is ready. The guest kernel then reads the object from the host, placing working pages in its own RAM.

One implementation could separate the exchange into two channels: requests and proxy notifications use a service protocol, while ready objects are read through a read-only network tree such as NFS. This tree is mounted in the service's private namespace. The module links a logical file to an NFS file by hash, while the application continues to use its existing path. The `nofsc` option disables the NFS client disk cache; the in-memory page cache continues to serve reads. [NFS manual](https://man7.org/linux/man-pages/man5/nfs.5.html).

The host holds the object while the guest is actively using it. The service protocol has corresponding operations to acquire, renew, and release a reference. Reconnection restores the association by hash.

The host verifies the complete content. The guest OS trusts the host proxy as part of its execution infrastructure; the connection to it and the object-serving mode protect verified content during transfer. An internet source may change, while the object published by the host retains the bytes that match its hash.

### 8. Mutable Data and an Optional Write Mode

Shared libraries, programs, and resources remain immutable objects. Private files are stored in the image as usual, while mutable data goes into the container's own writable layer or attached storage.

An additional intinode capability is to materialize the content as a separate ordinary file for a particular application. A user or runtime environment can enable this mode when a file represented by an internet inode needs to be changed. The shared cache object retains its original bytes and hash.

For a container, this mode can be connected to OverlayFS `copy_up`. This operation copies a file from the lower layer to the upper layer along with the required attributes. When materialization is enabled, the copy reads the internet inode's logical content, and the upper layer receives an ordinary file containing the program's or library's bytes. Subsequent writes change the container's own copy. [OverlayFS documentation](https://docs.kernel.org/filesystems/overlayfs.html).

For a VM, the materialized copy is placed in the guest's writable layer. With `MAP_PRIVATE`, page changes belong to the process. For writable `MAP_SHARED`, the optional mode first creates a separate file copy. [`mmap()` semantics](https://man7.org/linux/man-pages/man2/mmap.2.html).

Updating an image creates a new internet-inode tree. Objects with previous hashes are reused, while changed files are added under new hashes. Open files and process mappings using the old version keep their objects alive.

### 9. Image Preparation, Placement, and Object Transfer

For a container, the builder creates one OCI layer containing the final file tree. Shared-file reuse is provided by internet inodes with direct links to content by hash. The OCI specification allows an image with one layer and a standard runtime configuration. [OCI Image Manifest](https://github.com/opencontainers/image-spec/blob/main/manifest.md).

Preparation takes five steps:

1. The builder receives the application's ready file tree. When converting an existing multi-layer image, it applies all layers to produce the tree's final state.
2. It selects shared, immutable programs, libraries, and resources intended for publication. Private files remain ordinary files.
3. It calculates the hash and size of the selected files and publishes their content to the registry. An object with a known hash is reused.
4. It writes an internet inode in place of each selected file. Directories, symbolic and hard links, owners, permissions, and the tree's other attributes are preserved.
5. It packs the ready tree into one tar layer and creates an OCI manifest with the application's configuration: startup command, environment, and working directory.

A multi-stage build and its intermediate results can remain in development tools. The distributed image contains a single layer with the filesystem's final state. Ordinary private files and internet inodes for public components reside in the same tree.

For AppImage, Flatpak, and Snap, a similar package-file-tree preparation stage replaces selected shared files with internet inodes and includes the rest in the ordinary way.

The intinode mechanism separates content identification from the way content is obtained. A source adapter receives the hash, size, and addresses, then provides bytes for verification or an open object from a trusted shared cache. The transport choice therefore depends on the infrastructure:

| Option | Advantage | Operational characteristics |
| --- | --- | --- |
| Remote-disk directory | Objects are ordinary files at paths such as `sha256/<hash>`; the kernel can read them through a network filesystem | Requires network connectivity and operation of a shared directory; latency includes network-filesystem work |
| OCI Registry | Uses container-object distribution infrastructure and retrieval by digest | The builder publishes individual files as objects; the daemon fetches them through the registry API |
| IPFS — InterPlanetary File System | Content is addressed by CID and can arrive from multiple nodes | Publication includes storing and pinning objects on IPFS nodes |
| HTTP or S3 | Simple object delivery, mirrors, and ordinary object storage | Names and addresses are associated with hashes; availability is provided by the selected storage |

An OCI Registry provides blob retrieval at `GET /v2/<name>/blobs/<digest>`. For intinode, each immutable file is stored as an independent object; the internet inode links it to the required path in the image. The builder keeps an internal list of published objects. The registry adapter uses this list to track content, and the prefetch utility uses it to fetch a set of files. [OCI Distribution Specification](https://github.com/opencontainers/distribution-spec/blob/main/spec.md).

An unpacked file, its compressed representation, and an archive layer have different hashes. An internet inode identifies the complete content of an individual file. Information about the transport representation lets the daemon fetch the required blob and restore those bytes.

In S3, an object key can be built from the algorithm and hash. HTTP sources and mirrors provide the same content at their own addresses. The daemon chooses a source; a ready object can be used regardless of where it came from.

For IPFS, the source address contains the CID of the file representation. The intinode hash identifies the file's complete bytes, while the CID identifies its representation structure in IPFS. The adapter fetches and restores the content, then verifies it against the intinode hash. For continued availability, the published set is pinned on the serving nodes. [IPFS content addressing](https://docs.ipfs.tech/concepts/content-addressing/), [IPFS persistence and pinning](https://docs.ipfs.tech/concepts/persistence/).

A remote-disk option can directly expose the shared-cache directory through a network filesystem. OCI, IPFS, and HTTP/S3 are convenient for fetching objects into a cache. These methods can be combined: for example, a host fetches objects from OCI or IPFS, while guests read ready files from the host's directory.

### 10. System Startup and Prefetching

The boot environment contains the kernel, `intinode.ko`, the daemon, and the components needed to access a source. For a VM, this includes virtual-network configuration and access to the host proxy. This small set resides in initramfs or ordinary local files, after which the rest of the system tree becomes available.

For a known workload, a manifest defines the objects to prefetch. The utility interface is:

```text
intinode prefetch <manifest>
```

On a standalone computer, the utility fills the local cache. For a VM, requests go to the host proxy. For offline operation, the set is fetched and pinned in advance; in an isolated segment, a local mirror serves as the source.

Prefetching also moves network work from the moment an application starts to node preparation. With ordinary lazy fetching, a node obtains only the files that are actually needed.

### 11. How Savings Are Calculated

Let `F` be all occurrences of files selected for replacement by internet inodes in the deployed images, and `U` the set of their unique hashes. The volume of content before deduplication is:

```text
S_повтор = Σ size(f),  f ∈ F
```

The volume of the complete set after deduplication is:

```text
S_уник = Σ size(u),  u ∈ U
Content savings = 1 − S_уник / S_повтор
```

With lazy fetching, the cache contains the requested subset of `U`. It also needs space for internet inodes, ordinary image files, file metadata, and private writable layers.

This calculates the share of repeated bytes for intinode. The result depends on the image composition and exact full-file matches. Vendor estimates around 90% describe high data duplication in virtualized environments; a hash-based calculation shows the volume of shared files in a specific image set.

For data transfer, the size of internet inodes and objects missing from the cache are counted. An update transfers new objects; reused hashes retain their ready content. Startup time is measured separately for an empty cache, a ready working set, and prefetching.

The size of an internet-inode package and the volume of content in the cache are counted separately. For example, a compact application tree might take 2 MB, while its unique requested files could be much larger. Reusing those files determines the cost of the next installation.

The service overhead when opening a ready object includes recognizing the record and looking up its hash; the target scale for a local cache is microseconds. Reads from local data, access to the host over a virtual network, and fetching a missing object are measured separately. After an open file is linked to an object, subsequent reads use the held reference.

The first start of a lazy image can take longer because it waits for individual files. Less data transfer, a ready cache, and prefetching reduce this work. To plan a cloud node, it is useful to compare total time from image retrieval until the application is ready, as well as a restart with the same working set.

### 12. Portability Across Operating Systems

The OS-independent part of intinode includes the text record, hash addressing, immutable objects, content verification, and the interface for obtaining content. These rules are the same for a local cache and a network source.

Integration with a particular OS provides three actions: recognize an internet inode in an ordinary file, present logical attributes to the application, and connect file operations to verified content. Opening, reading, execution, and memory mapping must use the same file representation.

For Linux, this connection is implemented in VFS and the `intinode.ko` module. Another OS uses its own mechanisms for extending file access. A shared contract lets different systems obtain identical objects from one storage system; applications continue to use their OS's file interfaces.

### 13. Linux Implementation and Kubernetes Integration

The implementation has three groups of components:

| Component | Work |
| --- | --- |
| `intinode.ko` kernel module and VFS attachment points | Recognizes internet inodes, provides logical attributes, links to the object, waits for readiness, handles reading, execution, and memory mapping |
| `intinode-fetchd` daemon | Source adapters, fetching, decompression, verification, cache publication and cleanup; host-proxy mode for guests |
| Image-building and preparation utilities | Select shared files, calculate hashes, publish objects, create single-layer container and VM images with internet inodes, create manifests, prefetch, and check completeness |

Support in a guest Linux kernel connects it to the host proxy. Containers use the node's kernel module. Utilities run during build and deployment while preserving application file paths and attributes.

The proposed process for connecting to an existing Kubernetes cluster is:

1. Prepare selected worker nodes: a kernel with intinode attachment points, the `intinode.ko` module, daemon, and shared-cache directory. The daemon runs as an OS service with the node's base environment.
2. Add creation of single-layer OCI images with internet inodes for public components to the application build. Include private files in the image as ordinary files.
3. Use the existing container runtime to fetch the image and prepare its tree. Kubelet communicates with it through the standard CRI, the Container Runtime Interface. After startup, the node kernel handles the program's file accesses. [CRI documentation](https://kubernetes.io/docs/concepts/containers/cri/).
4. Direct selected workloads to the prepared nodes using ordinary placement rules. The Kubernetes scheduler continues to account for resources and existing pod-placement requirements.

An optional node agent can collect metrics and prefetch a specified list of files. It can be deployed through a DaemonSet. Pinning a set is enabled for a selected offline mode; the ordinary cache is populated on access and evicted according to its capacity policy. [DaemonSet documentation](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/).

### 14. Details for Interface Specifications

The architecture can be implemented with the described loading sequence. Four groups of technical decisions remain for agreeing on the formats and interfaces:

- **Internet inode encoding:** choice of JSON, delimiters, or fixed positions; address encoding; extending fields within 200 bytes; and versioning.
- **Kernel–daemon contract:** job and response formats, timeouts, daemon reconnection handling, and object-reference retention.
- **Guest–host protocol:** readiness notification, network reads, reference renewal, and recovery after a proxy restart.
- **Source-adapter contract:** obtaining identical content through remote disks, OCI, IPFS, HTTP, and object storage.

These decisions define component boundaries. The main data path is already specified: internet inode, kernel recognition, request by hash, object fetch and verification, then delivery of verified content through familiar file operations.
