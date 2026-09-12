<?php
$baseDir=realpath(__DIR__);

function inside($p){
    global $baseDir;
    $r=realpath($p);
    return $r!==false&&($r===$baseDir||strpos($r,$baseDir.DIRECTORY_SEPARATOR)===0);
}

function deleteDir($d){
    foreach(scandir($d) as $i){
        if($i==='.'||$i==='..')continue;
        $c=$d.DIRECTORY_SEPARATOR.$i;
        if(is_dir($c)&&!is_link($c))deleteDir($c);
        else @unlink($c);
    }
    @rmdir($d);
}

function human_filesize($b,$d=2){
    $s=['B','KB','MB','GB','TB'];
    $f=$b>0?floor(log($b,1024)):0;
    return sprintf("%.{$d}f",$b/pow(1024,$f)).' '.($s[$f]??'PB');
}

/*
============================================================
TIPOS QUE PODEM SER EDITADOS
============================================================
O conteúdo só é carregado quando o usuário clicar em EDITAR.
============================================================
*/
function isEditableFile($file){
    $ext=strtolower(pathinfo($file,PATHINFO_EXTENSION));

    $editable=[
        'txt','text','md','markdown',
        'php','php3','php4','php5','phtml',
        'html','htm',
        'css',
        'js','mjs','cjs',
        'json',
        'xml',
        'svg',
        'yml','yaml',
        'ini','conf','config',
        'env',
        'sh','bash',
        'bat','cmd',
        'java',
        'kt','kts',
        'c','h','cpp','cc','cxx','hpp',
        'cs',
        'py',
        'rb',
        'go',
        'rs',
        'sql',
        'log',
        'csv'
    ];

    return in_array($ext,$editable,true);
}

/*
============================================================
CAMINHO ATUAL
============================================================
*/
$path=isset($_GET['path'])?realpath($_GET['path']):$baseDir;

if(!$path||!inside($path)){
    die('Acesso negado.');
}

/*
============================================================
EDITOR
============================================================
IMPORTANTE:
O arquivo NÃO é lido na listagem.
Ele só é lido quando:
?edit_file=CAMINHO
============================================================
*/
if(isset($_GET['edit_file'])){

    $f=realpath($_GET['edit_file']);

    if(
        !$f||
        !inside($f)||
        !is_file($f)||
        !isEditableFile($f)
    ){
        http_response_code(403);
        die('Arquivo não permitido para edição.');
    }

    /*
     * Limite de segurança para não jogar arquivos enormes
     * dentro do navegador.
     */
    $size=@filesize($f);

    if($size!==false&&$size>10*1024*1024){
        http_response_code(413);
        die('Arquivo muito grande para edição pelo navegador.');
    }

    $content=@file_get_contents($f);

    if($content===false){
        http_response_code(500);
        die('Não foi possível ler o arquivo.');
    }

    header('Content-Type:text/html;charset=UTF-8');

    ?>
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Editar <?=htmlspecialchars(basename($f),ENT_QUOTES,'UTF-8')?></title>

    <style>
    *{box-sizing:border-box}
    body{
        margin:0;
        padding:15px;
        background:#111;
        color:#fff;
        font-family:Arial,sans-serif;
    }
    .editor{
        width:100%;
        max-width:1200px;
        margin:auto;
    }
    h2{
        margin:0 0 12px;
        font-size:20px;
    }
    textarea{
        width:100%;
        height:calc(100vh - 120px);
        resize:none;
        background:#080808;
        color:#eee;
        border:1px solid #333;
        border-radius:8px;
        padding:14px;
        outline:none;
        font-family:monospace;
        font-size:14px;
        line-height:1.5;
    }
    .buttons{
        margin-top:10px;
        display:flex;
        gap:8px;
    }
    button,a{
        border:0;
        border-radius:7px;
        padding:10px 16px;
        text-decoration:none;
        cursor:pointer;
        font-weight:bold;
    }
    .save{
        background:#2ecc71;
        color:#fff;
    }
    .back{
        background:#555;
        color:#fff;
    }
    </style>
    </head>

    <body>
    <div class="editor">

    <h2>
    ✍️ <?=htmlspecialchars(basename($f),ENT_QUOTES,'UTF-8')?>
    </h2>

    <form method="POST">

    <input
        type="hidden"
        name="edit_file"
        value="<?=htmlspecialchars($f,ENT_QUOTES,'UTF-8')?>"
    >

    <textarea name="content"><?=htmlspecialchars($content,ENT_NOQUOTES,'UTF-8')?></textarea>

    <div class="buttons">

    <a
        class="back"
        href="?path=<?=urlencode($path)?>"
    >
    ← Voltar
    </a>

    <button
        type="submit"
        class="save"
    >
    💾 Salvar
    </button>

    </div>

    </form>

    </div>
    </body>
    </html>
    <?php

    exit;
}

/*
============================================================
NOVO ARQUIVO
============================================================
*/
if(isset($_POST['new_file_name'])){

    $n=basename($_POST['new_file_name']);

    if(
        $n!==''&&
        !file_exists($path.DIRECTORY_SEPARATOR.$n)
    ){
        @file_put_contents(
            $path.DIRECTORY_SEPARATOR.$n,
            ''
        );
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
NOVA PASTA
============================================================
*/
if(isset($_POST['new_folder_name'])){

    $n=basename($_POST['new_folder_name']);

    if(
        $n!==''&&
        !file_exists($path.DIRECTORY_SEPARATOR.$n)
    ){
        @mkdir(
            $path.DIRECTORY_SEPARATOR.$n,
            0777,
            true
        );
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
UPLOAD
============================================================
*/
if(isset($_POST['upload'],$_FILES['file'])){

    $e=$_FILES['file']['error']??UPLOAD_ERR_NO_FILE;

    if($e===UPLOAD_ERR_OK){

        $n=basename($_FILES['file']['name']);

        if($n!==''){

            @move_uploaded_file(
                $_FILES['file']['tmp_name'],
                $path.DIRECTORY_SEPARATOR.$n
            );
        }
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
RENOMEAR
============================================================
*/
if(isset($_POST['rename_old'],$_POST['rename_new'])){

    $old=realpath(
        $path.DIRECTORY_SEPARATOR.$_POST['rename_old']
    );

    $n=basename($_POST['rename_new']);

    $new=$path.DIRECTORY_SEPARATOR.$n;

    if(
        $old&&
        inside($old)&&
        $n!==''&&
        $old!==$baseDir&&
        (!file_exists($new)||$new===$old)
    ){
        @rename($old,$new);
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
EXCLUIR
============================================================
*/
if(isset($_GET['delete'])){

    $t=realpath(
        $path.DIRECTORY_SEPARATOR.$_GET['delete']
    );

    if(
        $t&&
        inside($t)&&
        $t!==$baseDir
    ){

        if(
            is_dir($t)&&
            !is_link($t)
        ){
            deleteDir($t);
        }else{
            @unlink($t);
        }
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
DOWNLOAD ARQUIVO
============================================================
*/
if(isset($_GET['download'])){

    $f=realpath($_GET['download']);

    if(
        $f&&
        inside($f)&&
        is_file($f)
    ){

        $size=@filesize($f);

        header(
            'Content-Type:application/octet-stream'
        );

        header(
            'Content-Disposition:attachment; filename="'.
            basename($f).'"'
        );

        if($size!==false){
            header('Content-Length:'.$size);
        }

        readfile($f);
        exit;
    }
}

/*
============================================================
DOWNLOAD PASTA ZIP
============================================================
*/
if(isset($_GET['download_folder'])){

    $d=realpath($_GET['download_folder']);

    if(
        $d&&
        inside($d)&&
        is_dir($d)
    ){

        if(!class_exists('ZipArchive')){
            die('ZipArchive não está disponível no PHP.');
        }

        $tmp=sys_get_temp_dir();

        if(!is_writable($tmp)){
            $tmp=$path;
        }

        $zipFile=
            $tmp.
            DIRECTORY_SEPARATOR.
            basename($d).
            '_'.
            uniqid().
            '.zip';

        $zip=new ZipArchive;

        if(
            $zip->open(
                $zipFile,
                ZipArchive::CREATE|
                ZipArchive::OVERWRITE
            )===true
        ){

            $it=new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator(
                    $d,
                    FilesystemIterator::SKIP_DOTS
                ),
                RecursiveIteratorIterator::LEAVES_ONLY
            );

            foreach($it as $file){

                if($file->isFile()){

                    $zip->addFile(
                        $file->getPathname(),
                        substr(
                            $file->getPathname(),
                            strlen($d)+1
                        )
                    );
                }
            }

            $zip->close();

            if(is_file($zipFile)){

                header(
                    'Content-Type:application/zip'
                );

                header(
                    'Content-Disposition:attachment; filename="'.
                    basename($d).
                    '.zip"'
                );

                header(
                    'Content-Length:'.
                    filesize($zipFile)
                );

                readfile($zipFile);

                @unlink($zipFile);

                exit;
            }
        }
    }
}

/*
============================================================
EXTRAIR ZIP
============================================================
*/
if(isset($_GET['extract'])){

    $z=realpath($_GET['extract']);

    if(
        $z&&
        inside($z)&&
        is_file($z)&&
        strtolower(pathinfo($z,PATHINFO_EXTENSION))==='zip'
    ){

        if(!class_exists('ZipArchive')){
            die('ZipArchive não está disponível no PHP.');
        }

        $zip=new ZipArchive;

        if($zip->open($z)===true){

            $to=
                $path.
                DIRECTORY_SEPARATOR.
                pathinfo($z,PATHINFO_FILENAME);

            if(!file_exists($to)){
                @mkdir($to,0777,true);
            }

            if(inside($to)||$to===$baseDir){
                $zip->extractTo($to);
            }

            $zip->close();
        }
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
SALVAR EDIÇÃO
============================================================
*/
if(isset($_POST['edit_file'],$_POST['content'])){

    $f=realpath($_POST['edit_file']);

    if(
        $f&&
        inside($f)&&
        is_file($f)&&
        isEditableFile($f)
    ){

        @file_put_contents(
            $f,
            $_POST['content'],
            LOCK_EX
        );
    }

    header('Location:?path='.urlencode($path));
    exit;
}

/*
============================================================
LISTAGEM
============================================================
IMPORTANTE:
NÃO usa file_get_contents() aqui.
NÃO carrega conteúdo dos arquivos.
============================================================
*/
$items=@scandir($path)?:[];

?>
<!DOCTYPE html>
<html lang="pt-BR">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>Gerenciador de Arquivos</title>

<style>

*{
    box-sizing:border-box
}

body{
    font-family:Roboto,Arial,sans-serif;
    background:#f5f5f5;
    margin:0;
    padding:20px
}

.container{
    background:#fff;
    padding:20px;
    border-radius:12px;
    box-shadow:0 4px 15px #0002
}

h2{
    text-align:center;
    font-size:28px;
    color:#2c3e50;
    margin:0 0 20px
}

.top-buttons{
    display:flex;
    justify-content:center;
    gap:10px;
    margin-bottom:20px;
    flex-wrap:wrap
}

button,a{
    cursor:pointer;
    transition:.2s;
    text-decoration:none
}

button{
    border:0;
    padding:10px 18px;
    border-radius:8px;
    font-size:14px;
    font-weight:bold
}

.newfile{
    background:#1abc9c;
    color:#fff
}

.newfolder{
    background:#e67e22;
    color:#fff
}

.upload-btn{
    background:#3498db;
    color:#fff;
    position:relative;
    overflow:hidden
}

.upload-btn input{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    opacity:0;
    cursor:pointer
}

.voltar{
    background:#7f8c8d;
    color:#fff
}

ul{
    list-style:none;
    padding:0
}

li{
    display:flex;
    justify-content:space-between;
    align-items:center;
    background:#f0f0f0;
    margin-bottom:8px;
    padding:12px;
    border-radius:10px;
    position:relative
}

li span a{
    color:#34495e;
    font-weight:bold
}

.file-size{
    font-size:12px;
    color:#888;
    margin-left:6px
}

.menu-flutuante{
    display:none;
    position:absolute;
    top:40px;
    right:0;
    background:#fff;
    border:1px solid #ccc;
    border-radius:8px;
    box-shadow:0 4px 15px #0002;
    z-index:1000;
    min-width:160px
}

.menu-flutuante button,
.menu-flutuante a{
    display:block;
    width:100%;
    text-align:left;
    padding:8px 12px;
    border:0;
    background:0;
    color:#34495e
}

.menu-flutuante button:hover,
.menu-flutuante a:hover{
    background:#f0f0f0
}

</style>

<script>

function renameItem(o){

    var n=prompt(
        'Novo nome para: '+o,
        o
    );

    if(n&&n!==o){

        var f=document.createElement('form');

        f.method='POST';

        [
            ['rename_old',o],
            ['rename_new',n]
        ].forEach(function(x){

            var i=document.createElement('input');

            i.type='hidden';
            i.name=x[0];
            i.value=x[1];

            f.appendChild(i);
        });

        document.body.appendChild(f);

        f.submit();
    }
}

function newFile(){

    var n=prompt(
        'Nome do novo arquivo:'
    );

    if(n){

        var f=document.getElementById(
            'newFileForm'
        );

        f.new_file_name.value=n;

        f.submit();
    }
}

function newFolder(){

    var n=prompt(
        'Nome da nova pasta:'
    );

    if(n){

        var f=document.getElementById(
            'newFolderForm'
        );

        f.new_folder_name.value=n;

        f.submit();
    }
}

function showMenu(li){
    li.querySelector(
        '.menu-flutuante'
    ).style.display='block';
}

function hideMenu(li){
    li.querySelector(
        '.menu-flutuante'
    ).style.display='none';
}

</script>

</head>

<body>

<div class="container">

<h2>📂 Gerenciador de Arquivos</h2>

<div class="top-buttons">

<?php if($path!==$baseDir): ?>

<button
class="voltar"
onclick="location.href='?path=<?=urlencode(dirname($path))?>'"
>
🔙 Voltar
</button>

<?php endif; ?>

<form
method="POST"
enctype="multipart/form-data"
style="display:inline"
>

<button class="upload-btn">

📤 Upload

<input
type="file"
name="file"
onchange="this.form.submit()"
>

</button>

<input
type="hidden"
name="upload"
value="1"
>

</form>

<button
class="newfile"
onclick="newFile()"
>
📄 Novo Arquivo
</button>

<button
class="newfolder"
onclick="newFolder()"
>
📁 Nova Pasta
</button>

</div>

<ul>

<?php

foreach($items as $item){

    if(
        $item==='.'||
        $item==='..'
    ){
        continue;
    }

    $itemPath=realpath(
        $path.
        DIRECTORY_SEPARATOR.
        $item
    );

    if(
        !$itemPath||
        !inside($itemPath)
    ){
        continue;
    }

    $isDir=is_dir($itemPath);

    $icon=$isDir?'📁':'📄';

    /*
     * Apenas filesize.
     * NÃO lê o conteúdo.
     */
    $size=is_file($itemPath)
        ?human_filesize(
            @filesize($itemPath)
        )
        :'';

    $jn=json_encode(
        $item,
        JSON_UNESCAPED_UNICODE|
        JSON_UNESCAPED_SLASHES|
        JSON_HEX_TAG|
        JSON_HEX_AMP|
        JSON_HEX_APOS|
        JSON_HEX_QUOT
    );

    echo '<li
        onmouseover="showMenu(this)"
        onmouseout="hideMenu(this)"
    >';

    echo '<span>';

    if($isDir){

        echo '<a href="?path='.
            urlencode($itemPath).
            '">';

        echo $icon.
            ' '.
            htmlspecialchars(
                $item,
                ENT_QUOTES,
                'UTF-8'
            );

        echo '</a>';

    }else{

        echo $icon.
            ' '.
            htmlspecialchars(
                $item,
                ENT_QUOTES,
                'UTF-8'
            ).
            ' <span class="file-size">('.
            $size.
            ')</span>';
    }

    echo '</span>';

    echo '<div class="menu-flutuante">';

    if($isDir){

        echo '<a href="?download_folder='.
            urlencode($itemPath).
            '">📥 Baixar ZIP</a>';

    }else{

        echo '<a href="?download='.
            urlencode($itemPath).
            '">📥 Baixar</a>';

        if(
            strtolower(
                pathinfo(
                    $itemPath,
                    PATHINFO_EXTENSION
                )
            )==='zip'
        ){

            echo '<a href="?extract='.
                urlencode($itemPath).
                '">📦 Extrair ZIP</a>';
        }

        /*
         * Só mostra EDITAR para arquivos de texto.
         *
         * Não carrega o conteúdo aqui.
         */
        if(isEditableFile($itemPath)){

            echo '<a href="?edit_file='.
                urlencode($itemPath).
                '">✍️ Editar</a>';
        }
    }

    echo '<button
        type="button"
        onclick="renameItem('.
        $jn.
        ')"
    >✏️ Renomear</button>';

    echo '<a href="?path='.
        urlencode($path).
        '&delete='.
        urlencode($item).
        '"
        onclick="return confirm(\'Excluir '.
        htmlspecialchars(
            $item,
            ENT_QUOTES,
            'UTF-8'
        ).
        '?\')"
    >🗑️ Excluir</a>';

    echo '</div>';

    echo '</li>';
}

?>

</ul>

<form
id="newFileForm"
method="POST"
>
<input
type="hidden"
name="new_file_name"
>
</form>

<form
id="newFolderForm"
method="POST"
>
<input
type="hidden"
name="new_folder_name"
>
</form>

</div>

</body>
</html>