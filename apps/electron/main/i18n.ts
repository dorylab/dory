import { getStoredLocale, type MainLocale } from './locale.js';

type MessageKey =
    | 'menu.checkForUpdates'
    | 'menu.updateChannel'
    | 'menu.updateChannelStable'
    | 'menu.updateChannelBeta'
    | 'menu.resetSkippedUpdate'
    | 'menu.openUpdateDialogDebug'
    | 'menu.openLog'
    | 'error.openLogFailed'
    | 'quit.pendingChangesTitle'
    | 'quit.pendingChangesMessage'
    | 'quit.pendingChangesDetail'
    | 'quit.cancel'
    | 'quit.discardAndQuit'
    | 'updater.title'
    | 'updater.checking'
    | 'updater.pleaseWait'
    | 'updater.cancel'
    | 'updater.updateAvailable'
    | 'updater.updatePrompt'
    | 'updater.installUpdate'
    | 'updater.remindLater'
    | 'updater.skipVersion'
    | 'updater.autoDownloadInstall'
    | 'updater.downloadingTitle'
    | 'updater.downloading'
    | 'updater.downloadWillPrompt'
    | 'updater.downloaded'
    | 'updater.downloadComplete'
    | 'updater.restartInstall'
    | 'updater.restartLater'
    | 'updater.latestVersion'
    | 'updater.ok'
    | 'updater.failed'
    | 'updater.checkFailedNetwork'
    | 'updater.checkFailedServer'
    | 'updater.checkFailedGeneric'
    | 'updater.installLocationBlocked'
    | 'updater.installLocationBlockedDetail'
    | 'updater.notConfigured'
    | 'updater.notConfiguredDetail'
    | 'updater.skipCleared'
    | 'updater.channelChanged'
    | 'updater.channelChangedDetail'
    | 'updater.channelBusy'
    | 'updater.updateInProgress';

const MESSAGES: Record<MainLocale, Record<MessageKey, string>> = {
    'zh-CN': {
        'menu.checkForUpdates': '检查更新',
        'menu.updateChannel': '更新通道',
        'menu.updateChannelStable': '正式版',
        'menu.updateChannelBeta': 'Beta 测试版',
        'menu.resetSkippedUpdate': '恢复跳过的更新提醒',
        'menu.openUpdateDialogDebug': '打开更新弹窗（调试）',
        'menu.openLog': '打开日志',
        'error.openLogFailed': '打开日志失败',
        'quit.pendingChangesTitle': '退出 Dory？',
        'quit.pendingChangesMessage': '还有未提交的表格修改',
        'quit.pendingChangesDetail': '退出将丢弃所有待提交修改。你也可以取消退出，返回表格提交或撤销这些修改。',
        'quit.cancel': '取消',
        'quit.discardAndQuit': '丢弃并退出',
        'updater.title': '软件更新',
        'updater.checking': '正在检查更新...',
        'updater.pleaseWait': '请稍候',
        'updater.cancel': '取消',
        'updater.updateAvailable': '发现新版本 {version}',
        'updater.updatePrompt': '当前版本 {currentVersion}，是否开始下载并安装更新？',
        'updater.installUpdate': '安装更新',
        'updater.remindLater': '稍后提醒我',
        'updater.skipVersion': '跳过这个版本',
        'updater.autoDownloadInstall': '以后自动下载并安装更新',
        'updater.downloadingTitle': '正在更新',
        'updater.downloading': '正在下载更新...',
        'updater.downloadWillPrompt': '下载完成后会提示你重启安装',
        'updater.downloaded': '更新包已下载 ({version})',
        'updater.downloadComplete': '下载完成',
        'updater.restartInstall': '重启并安装',
        'updater.restartLater': '稍后重启',
        'updater.latestVersion': '当前已经是最新版本',
        'updater.ok': '知道了',
        'updater.failed': '更新失败',
        'updater.checkFailedNetwork': '无法连接更新服务器，请检查网络后重试。',
        'updater.checkFailedServer': '更新服务器暂时不可用，请稍后再试。',
        'updater.checkFailedGeneric': '检查更新失败，请稍后重试。',
        'updater.installLocationBlocked': '无法安装更新',
        'updater.installLocationBlockedDetail': '请将应用移动到“应用程序”文件夹后再重试更新。',
        'updater.notConfigured': '更新功能未配置',
        'updater.notConfiguredDetail': '未找到 app-update.yml 或 dev-app-update.yml，请先在构建配置中设置 publish。',
        'updater.skipCleared': '已恢复跳过版本提醒',
        'updater.channelChanged': '更新通道已切换',
        'updater.channelChangedDetail': '当前更新通道：{channel}。之后会按该通道检查更新。',
        'updater.channelBusy': '当前正在执行更新任务，请完成后再切换更新通道。',
        'updater.updateInProgress': '正在检查或下载更新，请稍后再试。',
    },
    'ja-JP': {
        'menu.checkForUpdates': 'アップデートを確認',
        'menu.updateChannel': '更新チャンネル',
        'menu.updateChannelStable': '安定版',
        'menu.updateChannelBeta': 'ベータ版',
        'menu.resetSkippedUpdate': 'スキップした更新をリセット',
        'menu.openUpdateDialogDebug': '更新ダイアログを開く（デバッグ）',
        'menu.openLog': 'ログを開く',
        'error.openLogFailed': 'ログを開けませんでした',
        'quit.pendingChangesTitle': 'Dory を終了しますか？',
        'quit.pendingChangesMessage': '未コミットのテーブル変更があります',
        'quit.pendingChangesDetail': '終了すると、保留中の変更はすべて破棄されます。キャンセルしてテーブルに戻り、変更をコミットまたは元に戻すこともできます。',
        'quit.cancel': 'キャンセル',
        'quit.discardAndQuit': '破棄して終了',
        'updater.title': 'ソフトウェア更新',
        'updater.checking': '更新を確認しています...',
        'updater.pleaseWait': 'しばらくお待ちください',
        'updater.cancel': 'キャンセル',
        'updater.updateAvailable': '新しいバージョンがあります: {version}',
        'updater.updatePrompt': '現在のバージョンは {currentVersion} です。今すぐダウンロードしてインストールしますか？',
        'updater.installUpdate': '更新をインストール',
        'updater.remindLater': '後で通知',
        'updater.skipVersion': 'このバージョンをスキップ',
        'updater.autoDownloadInstall': '今後は自動で更新をダウンロードしてインストールする',
        'updater.downloadingTitle': '更新中',
        'updater.downloading': '更新をダウンロードしています...',
        'updater.downloadWillPrompt': 'ダウンロード完了後、再起動してインストールするよう案内します。',
        'updater.downloaded': '更新をダウンロードしました ({version})',
        'updater.downloadComplete': 'ダウンロード完了',
        'updater.restartInstall': '再起動してインストール',
        'updater.restartLater': '後で再起動',
        'updater.latestVersion': 'すでに最新バージョンです。',
        'updater.ok': 'OK',
        'updater.failed': '更新に失敗しました',
        'updater.checkFailedNetwork': '更新サーバーに接続できません。ネットワークを確認して再試行してください。',
        'updater.checkFailedServer': '更新サーバーが一時的に利用できません。しばらくしてから再試行してください。',
        'updater.checkFailedGeneric': '更新の確認に失敗しました。後でもう一度お試しください。',
        'updater.installLocationBlocked': '更新をインストールできません',
        'updater.installLocationBlockedDetail': 'アプリを Applications フォルダへ移動してから、もう一度更新してください。',
        'updater.notConfigured': 'アップデーターが設定されていません',
        'updater.notConfiguredDetail': 'app-update.yml または dev-app-update.yml が見つかりません。先に electron-builder の publish を設定してください。',
        'updater.skipCleared': 'スキップした更新設定をリセットしました。',
        'updater.channelChanged': '更新チャンネルを変更しました',
        'updater.channelChangedDetail': '現在の更新チャンネル: {channel}。今後の確認にはこのチャンネルを使用します。',
        'updater.channelBusy': '現在の更新処理が終わってから更新チャンネルを切り替えてください。',
        'updater.updateInProgress': '更新の確認またはダウンロードが進行中です。後でもう一度お試しください。',
    },
    'es-ES': {
        'menu.checkForUpdates': 'Buscar actualizaciones',
        'menu.updateChannel': 'Canal de actualizaciones',
        'menu.updateChannelStable': 'Estable',
        'menu.updateChannelBeta': 'Beta',
        'menu.resetSkippedUpdate': 'Restablecer actualizaciones omitidas',
        'menu.openUpdateDialogDebug': 'Abrir diálogo de actualización (depuración)',
        'menu.openLog': 'Abrir registro',
        'error.openLogFailed': 'No se pudo abrir el registro',
        'quit.pendingChangesTitle': '¿Salir de Dory?',
        'quit.pendingChangesMessage': 'Hay cambios de tabla sin confirmar',
        'quit.pendingChangesDetail': 'Al salir se descartarán todos los cambios pendientes. Puedes cancelar, volver a la tabla y confirmar o deshacer los cambios.',
        'quit.cancel': 'Cancelar',
        'quit.discardAndQuit': 'Descartar y salir',
        'updater.title': 'Actualización de software',
        'updater.checking': 'Buscando actualizaciones...',
        'updater.pleaseWait': 'Espera un momento',
        'updater.cancel': 'Cancelar',
        'updater.updateAvailable': 'Hay una nueva versión disponible: {version}',
        'updater.updatePrompt': 'La versión actual es {currentVersion}. ¿Quieres descargarla e instalarla ahora?',
        'updater.installUpdate': 'Instalar actualización',
        'updater.remindLater': 'Recordármelo después',
        'updater.skipVersion': 'Omitir esta versión',
        'updater.autoDownloadInstall': 'Descargar e instalar actualizaciones automáticamente',
        'updater.downloadingTitle': 'Actualizando',
        'updater.downloading': 'Descargando actualización...',
        'updater.downloadWillPrompt': 'Cuando termine la descarga, se te pedirá reiniciar para instalar.',
        'updater.downloaded': 'Actualización descargada ({version})',
        'updater.downloadComplete': 'Descarga completada',
        'updater.restartInstall': 'Reiniciar e instalar',
        'updater.restartLater': 'Reiniciar después',
        'updater.latestVersion': 'Ya tienes la última versión.',
        'updater.ok': 'Aceptar',
        'updater.failed': 'La actualización falló',
        'updater.checkFailedNetwork': 'No se puede conectar con el servidor de actualizaciones. Revisa tu red e inténtalo de nuevo.',
        'updater.checkFailedServer': 'El servidor de actualizaciones no está disponible temporalmente. Inténtalo más tarde.',
        'updater.checkFailedGeneric': 'No se pudo comprobar si hay actualizaciones. Inténtalo más tarde.',
        'updater.installLocationBlocked': 'No se puede instalar la actualización',
        'updater.installLocationBlockedDetail': 'Mueve la aplicación a la carpeta Aplicaciones y vuelve a intentarlo.',
        'updater.notConfigured': 'Actualizador no configurado',
        'updater.notConfiguredDetail': 'Falta app-update.yml o dev-app-update.yml. Configura primero publish en electron-builder.',
        'updater.skipCleared': 'Se restableció la preferencia de versión omitida.',
        'updater.channelChanged': 'Canal de actualizaciones cambiado',
        'updater.channelChangedDetail': 'Canal actual: {channel}. Las próximas comprobaciones usarán este canal.',
        'updater.channelBusy': 'Termina la tarea de actualización actual antes de cambiar el canal.',
        'updater.updateInProgress': 'Ya hay una comprobación o descarga en curso. Inténtalo más tarde.',
    },
    'en-US': {
        'menu.checkForUpdates': 'Check for Updates',
        'menu.updateChannel': 'Update Channel',
        'menu.updateChannelStable': 'Stable',
        'menu.updateChannelBeta': 'Beta',
        'menu.resetSkippedUpdate': 'Reset Skipped Updates',
        'menu.openUpdateDialogDebug': 'Open Update Dialog (Debug)',
        'menu.openLog': 'Open Log',
        'error.openLogFailed': 'Open Log Failed',
        'quit.pendingChangesTitle': 'Quit Dory?',
        'quit.pendingChangesMessage': 'You have uncommitted table changes',
        'quit.pendingChangesDetail': 'Quitting will discard all pending changes. You can cancel, return to the table, and commit or revert them first.',
        'quit.cancel': 'Cancel',
        'quit.discardAndQuit': 'Discard and Quit',
        'updater.title': 'Software Update',
        'updater.checking': 'Checking for updates...',
        'updater.pleaseWait': 'Please wait',
        'updater.cancel': 'Cancel',
        'updater.updateAvailable': 'A new version is available: {version}',
        'updater.updatePrompt': 'Current version is {currentVersion}. Download and install now?',
        'updater.installUpdate': 'Install Update',
        'updater.remindLater': 'Remind Me Later',
        'updater.skipVersion': 'Skip This Version',
        'updater.autoDownloadInstall': 'Automatically download and install updates',
        'updater.downloadingTitle': 'Updating',
        'updater.downloading': 'Downloading update...',
        'updater.downloadWillPrompt': 'You will be prompted to restart after download.',
        'updater.downloaded': 'Update downloaded ({version})',
        'updater.downloadComplete': 'Download complete',
        'updater.restartInstall': 'Restart and Install',
        'updater.restartLater': 'Restart Later',
        'updater.latestVersion': 'You are up to date.',
        'updater.ok': 'OK',
        'updater.failed': 'Update Failed',
        'updater.checkFailedNetwork': 'Cannot reach update server. Please check your network and try again.',
        'updater.checkFailedServer': 'Update server is temporarily unavailable. Please try again later.',
        'updater.checkFailedGeneric': 'Failed to check for updates. Please try again later.',
        'updater.installLocationBlocked': 'Cannot Install Update',
        'updater.installLocationBlockedDetail': 'Move the app to the Applications folder, then try updating again.',
        'updater.notConfigured': 'Updater Not Configured',
        'updater.notConfiguredDetail': 'Missing app-update.yml or dev-app-update.yml. Configure publish in electron-builder first.',
        'updater.skipCleared': 'Skipped update preference has been reset.',
        'updater.channelChanged': 'Update channel changed',
        'updater.channelChangedDetail': 'Current update channel: {channel}. Future checks will use this channel.',
        'updater.channelBusy': 'Finish the current update task before switching update channels.',
        'updater.updateInProgress': 'An update check or download is already in progress. Please try again later.',
    },
};

function format(template: string, vars?: Record<string, string>) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, token: string) => vars[token] ?? `{${token}}`);
}

export function getMainLocale() {
    return getStoredLocale();
}

export function createMainI18n() {
    const t = (key: MessageKey, vars?: Record<string, string>) => {
        const locale = getMainLocale();
        return format(MESSAGES[locale][key], vars);
    };

    return {
        get locale() {
            return getMainLocale();
        },
        t,
    };
}

export type MainTranslator = ReturnType<typeof createMainI18n>['t'];
