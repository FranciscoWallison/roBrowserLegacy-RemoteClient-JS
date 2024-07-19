Setup the remote client nodejs
=======================

The remote client exist to help users without a FullClient on their computer to play by downloading resources from an external server.
Because pushing directly the fullclient on a server/ftp can provoke some errors, this tool allow to :

 - Get the files from a client used in another domain (Cross-origin resource sharing).
 - Extracting files directly from GRF archive (only version 0x200 supported for now - without DES encryption).
 - Converting BMP files to PNG to speed up the transfer.
 - Optimized to don't call any script if files are already extracted/converted (resource friendly).

 ### Add your fullclient ### 

Just put your GRFs files and DATA.INI file in the `resources/` directory.
Overwrite the `BGM/`, `data/` and `System/` directories with your own folders.

**Note: to be sure to use a compatible version of your GRFs, download *GRF Builder* and repack them manually (Option > Repack type > Decrypt -> Repack), it will ensure the GRFs files are converted in the proper version**

-----------------

 ### Configure the remote client ### 

Open *configs.php* file and complete it

----------------
