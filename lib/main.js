const {CompositeDisposable, Disposable, Emitter} = require('via');

class Alerts {
    activate(){
        this.disposables = new CompositeDisposable();
        this.emitter = new Emitter();
    }

    deactivate(){
        this.disposables.dispose();
        this.emitter.dispose();
    }
}

module.exports = new Alerts();
